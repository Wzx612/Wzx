"""Tests for the Knowledge Agent (LangGraph) and Coordinator Agent.

Test groups:
  TestKnowledgeAgent  — KnowledgeAgent.run() correctness (mocked DeepSeek)
  TestRAGConstraint   — retrieval is never bypassed; no direct LLM calls
  TestLangGraphFlow   — graph executes all nodes in the correct order
  TestCoordinator     — CoordinatorAgent routing and response wrapping

All tests use:
  - Real BGE model (module-scoped fixture, same teardown pattern as other modules)
  - Real PostgreSQL (function-scoped `db` from conftest)
  - Mocked _call_deepseek (no live DeepSeek calls)
"""

import asyncio
import operator
import uuid

import pytest
from langchain_core.messages import AIMessage, HumanMessage
from sentence_transformers import SentenceTransformer
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.agents.knowledge_agent as agent_module
from app.agents.coordinator import CoordinatorAgent
from app.agents.knowledge_agent import AgentResult, KnowledgeAgent, KnowledgeAgentState
from app.core.config import settings
from app.services.embedding_service import EmbeddingService

# ── Test chunks (same content as retrieval/RAG tests for semantic variety) ─────

CHUNKS_ZH = [
    "北京市2026年一季度住宅市场成交报告：整体成交量同比下降15.3%，"
    "均价上涨3.2%，五环内刚需购房持续活跃，二手房挂牌周期拉长至平均75天。",
    "深圳写字楼市场2026年年度分析：整体空置率上升至22.5%，"
    "平均租金同比下降8.3%，企业普遍缩减办公面积，南山区新增供应量创历史新高。",
    "量子计算2026年进展报告：全球量子比特数量突破1000个，"
    "计算错误率降至0.01%以下，多家科技公司宣布商业化产品路线图，生态系统加速完善。",
]


# ── Module-scoped setup ────────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def bge_model():
    import gc

    model = SentenceTransformer(EmbeddingService.MODEL_NAME)
    EmbeddingService._model = model
    yield model
    EmbeddingService._model = None
    del model
    gc.collect()


def _run(coro):
    return asyncio.run(coro)


def _make_engine():
    return create_async_engine(settings.DATABASE_URL, pool_size=1, max_overflow=0)


@pytest.fixture(scope="module")
def agent_test_data(bge_model):
    """Insert 3 Chinese chunks + embeddings once. Yield doc metadata. Cleanup after."""
    doc_id = str(uuid.uuid4())

    async def _setup():
        engine = _make_engine()
        factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with factory() as db:
            await db.execute(text(f"""
                INSERT INTO knowledge_documents (id, file_name, file_type, file_size, minio_path)
                VALUES ('{doc_id}'::uuid, 'agent_test.pdf', 'pdf', 1024, 'test/agent_test.pdf')
            """))
            for i, chunk_text in enumerate(CHUNKS_ZH):
                cid = str(uuid.uuid4())
                safe = chunk_text.replace("'", "''")
                await db.execute(text(f"""
                    INSERT INTO knowledge_chunks (id, document_id, chunk_index, chunk_text)
                    VALUES ('{cid}'::uuid, '{doc_id}'::uuid, {i}, '{safe}')
                """))
            await db.commit()
            n = await EmbeddingService.generate_for_document(db, doc_id)
        await engine.dispose()
        return n

    n = _run(_setup())
    assert n == len(CHUNKS_ZH)
    yield {"doc_id": doc_id, "chunk_count": n}

    async def _teardown():
        engine = _make_engine()
        factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with factory() as db:
            await db.execute(
                text(f"DELETE FROM knowledge_documents WHERE id = '{doc_id}'::uuid")
            )
            await db.commit()
        await engine.dispose()

    _run(_teardown())


# ── Mock helper ────────────────────────────────────────────────────────────────


def _fake_call(answer: str):
    async def fake(messages):
        return answer
    return fake


# ── Agent correctness ──────────────────────────────────────────────────────────


class TestKnowledgeAgent:
    async def test_run_returns_agent_result(self, agent_test_data, db, monkeypatch):
        monkeypatch.setattr(agent_module, "_call_deepseek", _fake_call("测试答案"))
        result = await KnowledgeAgent.run(
            db, "北京住宅市场成交量", document_id=agent_test_data["doc_id"]
        )
        assert isinstance(result, AgentResult)

    async def test_answer_from_deepseek(self, agent_test_data, db, monkeypatch):
        monkeypatch.setattr(agent_module, "_call_deepseek", _fake_call("北京房市答案"))
        result = await KnowledgeAgent.run(
            db, "北京住宅市场", document_id=agent_test_data["doc_id"]
        )
        assert result.answer == "北京房市答案"

    async def test_sources_populated(self, agent_test_data, db, monkeypatch):
        monkeypatch.setattr(agent_module, "_call_deepseek", _fake_call("答案"))
        result = await KnowledgeAgent.run(
            db, "北京住宅成交量价格", document_id=agent_test_data["doc_id"]
        )
        assert len(result.sources) > 0

    async def test_sources_have_required_fields(self, agent_test_data, db, monkeypatch):
        monkeypatch.setattr(agent_module, "_call_deepseek", _fake_call("答案"))
        result = await KnowledgeAgent.run(
            db, "市场报告", document_id=agent_test_data["doc_id"]
        )
        for s in result.sources:
            assert "chunk_id" in s
            assert "document_id" in s
            assert "file_name" in s
            assert "chunk_index" in s
            assert "chunk_text" in s
            assert "similarity" in s

    async def test_sources_file_name_correct(self, agent_test_data, db, monkeypatch):
        monkeypatch.setattr(agent_module, "_call_deepseek", _fake_call("答案"))
        result = await KnowledgeAgent.run(
            db, "北京住宅", document_id=agent_test_data["doc_id"]
        )
        for s in result.sources:
            assert s["file_name"] == "agent_test.pdf"

    async def test_multi_turn_history_passed_to_deepseek(self, agent_test_data, db, monkeypatch):
        """Prior conversation history must appear in the messages sent to DeepSeek."""
        captured = []

        async def fake(messages):
            captured.append(messages)
            return "答案"

        monkeypatch.setattr(agent_module, "_call_deepseek", fake)
        history = [
            {"role": "user", "content": "之前的问题"},
            {"role": "assistant", "content": "之前的答案"},
        ]
        await KnowledgeAgent.run(
            db, "北京住宅", document_id=agent_test_data["doc_id"], history=history
        )
        assert len(captured) == 1
        roles = [m["role"] for m in captured[0]]
        assert "assistant" in roles, "History must appear in DeepSeek messages"

    async def test_messages_include_human_and_ai(self, agent_test_data, db, monkeypatch):
        """Final state messages must contain both the question and the answer."""
        monkeypatch.setattr(agent_module, "_call_deepseek", _fake_call("答案内容"))
        result = await KnowledgeAgent.run(
            db, "北京住宅市场", document_id=agent_test_data["doc_id"]
        )
        msg_types = [type(m).__name__ for m in result.messages]
        assert "HumanMessage" in msg_types
        assert "AIMessage" in msg_types


# ── RAG constraint ─────────────────────────────────────────────────────────────


class TestRAGConstraint:
    async def test_empty_kb_skips_deepseek(self, db, monkeypatch):
        """When retrieval returns nothing, DeepSeek must NOT be called."""
        called = []

        async def fake(messages):
            called.append(True)
            return "答案"

        monkeypatch.setattr(agent_module, "_call_deepseek", fake)
        result = await KnowledgeAgent.run(db, "问题", document_id=str(uuid.uuid4()))
        assert len(called) == 0, "DeepSeek must not be called when retrieval is empty"
        assert result.sources == []

    async def test_empty_kb_returns_fallback_message(self, db, monkeypatch):
        monkeypatch.setattr(agent_module, "_call_deepseek", _fake_call("不应出现"))
        result = await KnowledgeAgent.run(db, "问题", document_id=str(uuid.uuid4()))
        # Must be a fallback, not the mocked answer
        assert result.answer != "不应出现"
        assert len(result.answer) > 0

    async def test_retrieval_always_runs(self, agent_test_data, db, monkeypatch):
        """Retrieval must always run — verified by checking sources are from real DB."""
        monkeypatch.setattr(agent_module, "_call_deepseek", _fake_call("答案"))
        result = await KnowledgeAgent.run(
            db, "北京住宅成交量", document_id=agent_test_data["doc_id"]
        )
        # If retrieval ran, sources must contain real chunk_ids (UUIDs from DB)
        assert len(result.sources) > 0
        for s in result.sources:
            # Real chunk_ids are UUIDs (36 chars with dashes)
            assert len(s["chunk_id"]) == 36


# ── LangGraph flow ─────────────────────────────────────────────────────────────


class TestLangGraphFlow:
    async def test_all_three_nodes_execute(self, agent_test_data, db, monkeypatch):
        """All three graph nodes must run for every question."""
        monkeypatch.setattr(agent_module, "_call_deepseek", _fake_call("答案"))
        result = await KnowledgeAgent.run(
            db, "北京住宅市场", document_id=agent_test_data["doc_id"]
        )
        assert set(result.nodes_visited) == {"analyze", "retrieve", "synthesize"}, (
            f"Expected all three nodes, got: {result.nodes_visited}"
        )

    async def test_nodes_execute_in_correct_order(self, agent_test_data, db, monkeypatch):
        """Nodes must execute: analyze → retrieve → synthesize."""
        monkeypatch.setattr(agent_module, "_call_deepseek", _fake_call("答案"))
        result = await KnowledgeAgent.run(
            db, "北京住宅", document_id=agent_test_data["doc_id"]
        )
        assert result.nodes_visited == ["analyze", "retrieve", "synthesize"], (
            f"Wrong node order: {result.nodes_visited}"
        )

    async def test_nodes_run_even_when_retrieval_empty(self, db, monkeypatch):
        """All three nodes must run even when the knowledge base is empty."""
        monkeypatch.setattr(agent_module, "_call_deepseek", _fake_call("答案"))
        result = await KnowledgeAgent.run(db, "问题", document_id=str(uuid.uuid4()))
        assert result.nodes_visited == ["analyze", "retrieve", "synthesize"]

    async def test_messages_accumulate_across_nodes(self, agent_test_data, db, monkeypatch):
        """Messages list must contain both HumanMessage (from analyze) and
        AIMessage (from synthesize) after the full graph run."""
        monkeypatch.setattr(agent_module, "_call_deepseek", _fake_call("图流程答案"))
        result = await KnowledgeAgent.run(
            db, "北京住宅市场", document_id=agent_test_data["doc_id"]
        )
        human_msgs = [m for m in result.messages if isinstance(m, HumanMessage)]
        ai_msgs = [m for m in result.messages if isinstance(m, AIMessage)]
        assert len(human_msgs) >= 1, "analyze_node must have added a HumanMessage"
        assert len(ai_msgs) >= 1, "synthesize_node must have added an AIMessage"
        assert ai_msgs[-1].content == "图流程答案"


# ── Coordinator ────────────────────────────────────────────────────────────────


class TestCoordinator:
    async def test_coordinator_returns_response(self, agent_test_data, db, monkeypatch):
        monkeypatch.setattr(agent_module, "_call_deepseek", _fake_call("协调答案"))
        resp = await CoordinatorAgent.run(
            db, "北京住宅成交量", document_id=agent_test_data["doc_id"]
        )
        assert resp.answer == "协调答案"

    async def test_coordinator_sets_agent_used(self, agent_test_data, db, monkeypatch):
        monkeypatch.setattr(agent_module, "_call_deepseek", _fake_call("答案"))
        resp = await CoordinatorAgent.run(
            db, "市场分析", document_id=agent_test_data["doc_id"]
        )
        assert resp.agent_used == "knowledge"

    async def test_coordinator_propagates_sources(self, agent_test_data, db, monkeypatch):
        monkeypatch.setattr(agent_module, "_call_deepseek", _fake_call("答案"))
        resp = await CoordinatorAgent.run(
            db, "北京住宅市场", document_id=agent_test_data["doc_id"]
        )
        assert len(resp.sources) > 0
        assert all("file_name" in s for s in resp.sources)

    async def test_coordinator_propagates_nodes_visited(self, agent_test_data, db, monkeypatch):
        monkeypatch.setattr(agent_module, "_call_deepseek", _fake_call("答案"))
        resp = await CoordinatorAgent.run(
            db, "北京住宅", document_id=agent_test_data["doc_id"]
        )
        assert resp.nodes_visited == ["analyze", "retrieve", "synthesize"]

    async def test_coordinator_global_search_no_document_id(self, agent_test_data, db, monkeypatch):
        """Coordinator must work when no document_id is given (global KB search)."""
        monkeypatch.setattr(agent_module, "_call_deepseek", _fake_call("全局搜索答案"))
        resp = await CoordinatorAgent.run(db, "住宅市场成交量")
        # Should still find chunks from the test document (global search)
        assert resp.answer == "全局搜索答案"
        assert len(resp.nodes_visited) == 3
