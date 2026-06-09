"""Integration tests for RAGService (knowledge_rag_service.py).

Strategy:
  - Real BGE model + real PostgreSQL for retrieval (proves RAG constraint is enforced)
  - Mocked _call_deepseek / _stream_deepseek so no live DeepSeek API needed
  - Module-scoped fixtures insert test data ONCE via asyncio.run() to avoid
    repeating ~2s BGE encoding per test function.

Test groups:
  TestRAGAsk    — non-streaming ask() correctness
  TestRAGStream — streaming ask_stream() event sequence
  TestCitations — citation field completeness and correctness
"""

import asyncio
import json
import uuid

import pytest
from sentence_transformers import SentenceTransformer
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.services.knowledge_rag_service as rag_module
from app.core.config import settings
from app.services.embedding_service import EmbeddingService
from app.services.knowledge_rag_service import RAGResponse, RAGService

# ── Test chunks ────────────────────────────────────────────────────────────────

CHUNKS_ZH = [
    # idx 0 — Beijing residential
    "北京市2026年一季度住宅市场成交报告：整体成交量同比下降15.3%，"
    "均价上涨3.2%，五环内刚需购房持续活跃，二手房挂牌周期拉长至平均75天。",
    # idx 1 — Shenzhen office
    "深圳写字楼市场2026年年度分析：整体空置率上升至22.5%，"
    "平均租金同比下降8.3%，企业普遍缩减办公面积，南山区新增供应量创历史新高。",
    # idx 2 — Quantum computing (off-topic)
    "量子计算2026年进展报告：全球量子比特数量突破1000个，"
    "计算错误率降至0.01%以下，多家科技公司宣布商业化产品路线图，生态系统加速完善。",
]


# ── Module-scoped setup helpers ────────────────────────────────────────────────


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
def qa_test_data(bge_model):
    """Insert Chinese test chunks + BGE embeddings once. Yield metadata. Cleanup after."""
    doc_id = str(uuid.uuid4())

    async def _setup():
        engine = _make_engine()
        factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with factory() as db:
            await db.execute(text(f"""
                INSERT INTO knowledge_documents (id, file_name, file_type, file_size, minio_path)
                VALUES ('{doc_id}'::uuid, 'rag_qa_test.pdf', 'pdf', 1024, 'test/rag_qa_test.pdf')
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


# ── Non-streaming tests ────────────────────────────────────────────────────────


class TestRAGAsk:
    async def test_returns_rag_response(self, qa_test_data, db, monkeypatch):
        monkeypatch.setattr(rag_module, "_call_deepseek", _fake_call("测试答案内容"))
        result = await RAGService.ask(
            db, "北京住宅成交量", document_id=qa_test_data["doc_id"]
        )
        assert isinstance(result, RAGResponse)

    async def test_answer_comes_from_deepseek(self, qa_test_data, db, monkeypatch):
        monkeypatch.setattr(rag_module, "_call_deepseek", _fake_call("正确答案"))
        result = await RAGService.ask(
            db, "北京住宅成交量", document_id=qa_test_data["doc_id"]
        )
        assert result.answer == "正确答案"

    async def test_sources_are_populated(self, qa_test_data, db, monkeypatch):
        monkeypatch.setattr(rag_module, "_call_deepseek", _fake_call("答案"))
        result = await RAGService.ask(
            db, "北京住宅成交量", document_id=qa_test_data["doc_id"]
        )
        assert len(result.sources) > 0

    async def test_history_is_forwarded_to_deepseek(self, qa_test_data, db, monkeypatch):
        """The messages passed to DeepSeek must include history turns."""
        captured: list[list] = []

        async def fake_call(messages):
            captured.append(messages)
            return "答案"

        monkeypatch.setattr(rag_module, "_call_deepseek", fake_call)
        history = [
            {"role": "user", "content": "上一个问题"},
            {"role": "assistant", "content": "上一个答案"},
        ]
        await RAGService.ask(
            db, "北京住宅", document_id=qa_test_data["doc_id"], history=history
        )
        assert len(captured) == 1
        roles = [m["role"] for m in captured[0]]
        assert "assistant" in roles, "History assistant turn must appear in messages"

    async def test_empty_knowledge_base_skips_deepseek(self, db, monkeypatch):
        """When retrieval returns nothing, DeepSeek must NOT be called."""
        called = []

        async def fake_call(messages):
            called.append(True)
            return "答案"

        monkeypatch.setattr(rag_module, "_call_deepseek", fake_call)
        result = await RAGService.ask(db, "任意问题", document_id=str(uuid.uuid4()))
        assert len(called) == 0, "DeepSeek was called despite empty retrieval"
        assert result.sources == []
        assert len(result.answer) > 0  # returns the 'no information found' message


# ── Streaming tests ────────────────────────────────────────────────────────────


class TestRAGStream:
    async def test_sources_event_emitted_first(self, qa_test_data, db, monkeypatch):
        monkeypatch.setattr(rag_module, "_stream_deepseek", _fake_stream(["答案内容"]))
        events = await _collect_events(
            RAGService.ask_stream(db, "北京住宅成交量", document_id=qa_test_data["doc_id"])
        )
        types = [e["type"] for e in events]
        assert "sources" in types
        assert types.index("sources") == 0, "sources event must be the very first event"

    async def test_done_event_is_last(self, qa_test_data, db, monkeypatch):
        monkeypatch.setattr(rag_module, "_stream_deepseek", _fake_stream(["答案"]))
        events = await _collect_events(
            RAGService.ask_stream(db, "北京住宅", document_id=qa_test_data["doc_id"])
        )
        assert events[-1]["type"] == "done"

    async def test_chunk_events_carry_content(self, qa_test_data, db, monkeypatch):
        tokens = ["北", "京", "住", "宅"]
        monkeypatch.setattr(rag_module, "_stream_deepseek", _fake_stream(tokens))
        events = await _collect_events(
            RAGService.ask_stream(db, "北京住宅", document_id=qa_test_data["doc_id"])
        )
        chunk_events = [e for e in events if e["type"] == "chunk"]
        assert len(chunk_events) == len(tokens)
        contents = [e["content"] for e in chunk_events]
        assert contents == tokens

    async def test_empty_kb_stream_no_deepseek_call(self, db, monkeypatch):
        """With empty knowledge base, _stream_deepseek must not be called."""
        called = []

        async def fake_stream(messages):
            called.append(True)
            yield "token"

        monkeypatch.setattr(rag_module, "_stream_deepseek", fake_stream)
        events = await _collect_events(
            RAGService.ask_stream(db, "问题", document_id=str(uuid.uuid4()))
        )
        types = [e["type"] for e in events]
        assert len(called) == 0, "_stream_deepseek must not be called on empty retrieval"
        assert "sources" in types
        assert "done" in types
        # The sources event must list an empty array
        sources_ev = next(e for e in events if e["type"] == "sources")
        assert sources_ev["sources"] == []


# ── Citation tests ─────────────────────────────────────────────────────────────


class TestCitations:
    async def test_all_citation_fields_present(self, qa_test_data, db, monkeypatch):
        monkeypatch.setattr(rag_module, "_call_deepseek", _fake_call("答案"))
        result = await RAGService.ask(
            db, "北京住宅成交量价格", document_id=qa_test_data["doc_id"]
        )
        assert len(result.sources) > 0
        for s in result.sources:
            assert s.chunk_id, "chunk_id must not be empty"
            assert s.document_id, "document_id must not be empty"
            assert s.file_name, "file_name must not be empty"
            assert isinstance(s.chunk_index, int), "chunk_index must be int"
            assert s.chunk_text, "chunk_text must not be empty"
            assert isinstance(s.similarity, float), "similarity must be float"
            assert 0.0 <= s.similarity <= 1.1, f"similarity out of range: {s.similarity}"

    async def test_sources_belong_to_correct_document(self, qa_test_data, db, monkeypatch):
        monkeypatch.setattr(rag_module, "_call_deepseek", _fake_call("答案"))
        result = await RAGService.ask(
            db, "市场分析报告", document_id=qa_test_data["doc_id"]
        )
        for s in result.sources:
            assert s.document_id == qa_test_data["doc_id"], (
                f"Source document_id {s.document_id!r} != expected {qa_test_data['doc_id']!r}"
            )

    async def test_file_name_matches_knowledge_base(self, qa_test_data, db, monkeypatch):
        monkeypatch.setattr(rag_module, "_call_deepseek", _fake_call("答案"))
        result = await RAGService.ask(
            db, "北京住宅", document_id=qa_test_data["doc_id"]
        )
        for s in result.sources:
            assert s.file_name == "rag_qa_test.pdf", (
                f"Expected file_name='rag_qa_test.pdf', got {s.file_name!r}"
            )


# ── Helpers ────────────────────────────────────────────────────────────────────


def _fake_call(answer: str):
    """Return an async function that yields a fixed answer string."""
    async def fake(messages):
        return answer
    return fake


def _fake_stream(tokens: list[str]):
    """Return an async generator function that yields the given tokens."""
    async def fake(messages):
        for t in tokens:
            yield t
    return fake


async def _collect_events(gen) -> list[dict]:
    """Drive an ask_stream() generator and collect parsed SSE event dicts."""
    events = []
    async for sse_str in gen:
        line = sse_str.strip()
        if line.startswith("data: "):
            events.append(json.loads(line[6:]))
    return events
