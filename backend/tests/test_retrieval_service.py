"""Integration tests for RetrievalService.

Requires both:
  - Real PostgreSQL (via conftest.db fixture)
  - Real BGE model (loaded once via module-scoped fixture)

Test data strategy:
  A single test document with 5 semantically distinct chunks is inserted ONCE
  per test module (module-scoped fixture using asyncio.run) to avoid repeating
  ~2s embedding generation for every function-scoped test.

  The function-scoped `db` fixture from conftest.py provides a fresh DB
  connection per test, querying the pre-inserted shared test data.

Test categories:
  TestRetrieval      — core retrieve() behaviour (top_k, threshold, filter, mode)
  TestChineseAccuracy — Chinese semantic correctness with known content
  TestEnglishQuery   — English query produces valid results from BGE
  TestResultSchema   — response field validation
"""

import asyncio
import uuid

import pytest
from sentence_transformers import SentenceTransformer
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.services.embedding_service import EmbeddingService
from app.services.retrieval_service import RetrievalChunk, RetrievalService

# ── Semantically distinct test chunks (Chinese) ────────────────────────────────
# Each chunk is on a DIFFERENT topic so retrieval accuracy is unambiguous.

CHUNKS_ZH = [
    # idx 0 — Beijing residential market
    "北京市2026年一季度住宅市场成交报告：整体成交量同比下降15.3%，"
    "均价上涨3.2%，五环内刚需购房持续活跃，二手房挂牌周期拉长至平均75天。",
    # idx 1 — Shenzhen office market
    "深圳写字楼市场2026年年度分析：整体空置率上升至22.5%，"
    "平均租金同比下降8.3%，企业普遍缩减办公面积，南山区新增供应量创历史新高。",
    # idx 2 — Quantum computing (unrelated to real estate)
    "量子计算2026年进展报告：全球量子比特数量突破1000个，"
    "计算错误率降至0.01%以下，多家科技公司宣布商业化产品路线图，生态系统加速完善。",
    # idx 3 — Climate change (unrelated)
    "全球气候变化年度报告：2025年全球平均气温创历史新高，"
    "极端天气事件频率增加超过40%，海平面上升速度加快，各国碳排放目标执行情况差异显著。",
    # idx 4 — AI in medicine (unrelated)
    "人工智能医疗诊断2026年综述：AI辅助诊断系统准确率达到95%，"
    "特别在癌症早期筛查领域表现突出，FDA已批准多款AI诊断产品上市，医院采购比例持续攀升。",
]

CHUNKS_EN = [
    # idx 0 — New York residential market
    "New York residential market Q1 2026 report: transaction volume declined 12%, "
    "average price rose 4.5%, Manhattan remains tight with inventory at historic lows.",
    # idx 1 — unrelated: renewable energy
    "Renewable energy global capacity 2026: solar installations surpassed 3 TW total, "
    "wind power costs fell below $20/MWh, battery storage deployments doubled year-on-year.",
    # idx 2 — unrelated: space exploration
    "Space exploration 2026 milestones: commercial lunar landing achieved, Mars sample "
    "return mission launch confirmed for 2028, satellite mega-constellation competition intensifies.",
]


# ── Module-scoped fixtures ─────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def bge_model() -> SentenceTransformer:
    """Load BGE once for this module and inject into EmbeddingService.

    Clears the reference on teardown so the ~1.3 GB model doesn't linger when
    non-model tests (e.g. test_vector_store.py) run afterward.
    """
    import gc

    model = SentenceTransformer(EmbeddingService.MODEL_NAME)
    EmbeddingService._model = model
    yield model
    EmbeddingService._model = None
    del model
    gc.collect()


def _run(coro):
    """Run a coroutine synchronously — used in module-scoped sync fixtures."""
    return asyncio.run(coro)


def _make_engine():
    return create_async_engine(settings.DATABASE_URL, pool_size=1, max_overflow=0)


@pytest.fixture(scope="module")
def zh_test_data(bge_model):
    """Insert Chinese test chunks + BGE embeddings once. Yield doc_id. Cleanup after."""
    doc_id = str(uuid.uuid4())

    async def _setup():
        engine = _make_engine()
        factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with factory() as db:
            await db.execute(
                text(f"""
                    INSERT INTO knowledge_documents
                        (id, file_name, file_type, file_size, minio_path)
                    VALUES
                        ('{doc_id}'::uuid, 'zh_accuracy_test.pdf', 'pdf', 1024, 'test/zh_accuracy_test.pdf')
                """)
            )
            for i, chunk_text in enumerate(CHUNKS_ZH):
                cid = str(uuid.uuid4())
                safe = chunk_text.replace("'", "''")
                await db.execute(
                    text(f"""
                        INSERT INTO knowledge_chunks
                            (id, document_id, chunk_index, chunk_text)
                        VALUES
                            ('{cid}'::uuid, '{doc_id}'::uuid, {i}, '{safe}')
                    """)
                )
            await db.commit()
            n = await EmbeddingService.generate_for_document(db, doc_id)
        await engine.dispose()
        return n

    count = _run(_setup())
    assert count == len(CHUNKS_ZH), f"Expected {len(CHUNKS_ZH)} embeddings, got {count}"

    yield {"doc_id": doc_id, "chunk_count": count}

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


@pytest.fixture(scope="module")
def en_test_data(bge_model):
    """Insert English test chunks + BGE embeddings once. Yield doc_id. Cleanup after."""
    doc_id = str(uuid.uuid4())

    async def _setup():
        engine = _make_engine()
        factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with factory() as db:
            await db.execute(
                text(f"""
                    INSERT INTO knowledge_documents
                        (id, file_name, file_type, file_size, minio_path)
                    VALUES
                        ('{doc_id}'::uuid, 'en_test.pdf', 'pdf', 1024, 'test/en_test.pdf')
                """)
            )
            for i, chunk_text in enumerate(CHUNKS_EN):
                cid = str(uuid.uuid4())
                safe = chunk_text.replace("'", "''")
                await db.execute(
                    text(f"""
                        INSERT INTO knowledge_chunks
                            (id, document_id, chunk_index, chunk_text)
                        VALUES
                            ('{cid}'::uuid, '{doc_id}'::uuid, {i}, '{safe}')
                    """)
                )
            await db.commit()
            n = await EmbeddingService.generate_for_document(db, doc_id)
        await engine.dispose()
        return n

    count = _run(_setup())
    assert count == len(CHUNKS_EN)

    yield {"doc_id": doc_id, "chunk_count": count}

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


# ── Core retrieval behaviour ──────────────────────────────────────────────────


class TestRetrieval:
    async def test_retrieve_returns_list(self, zh_test_data, db):
        results = await RetrievalService.retrieve(
            db, "北京房地产", document_id=zh_test_data["doc_id"]
        )
        assert isinstance(results, list)

    async def test_top_k_default_is_5(self, zh_test_data, db):
        results = await RetrievalService.retrieve(
            db, "市场分析报告", document_id=zh_test_data["doc_id"]
        )
        assert len(results) <= 5

    async def test_top_k_custom(self, zh_test_data, db):
        results = await RetrievalService.retrieve(
            db, "市场分析", top_k=2, document_id=zh_test_data["doc_id"]
        )
        assert len(results) <= 2

    async def test_min_similarity_filters_low_scores(self, zh_test_data, db):
        # Very high threshold should filter out most (possibly all) results
        results = await RetrievalService.retrieve(
            db,
            "北京住宅市场成交量",
            top_k=5,
            min_similarity=0.99,
            document_id=zh_test_data["doc_id"],
        )
        for r in results:
            assert r.similarity >= 0.99

    async def test_min_similarity_zero_returns_top_k(self, zh_test_data, db):
        results = await RetrievalService.retrieve(
            db,
            "市场分析",
            top_k=5,
            min_similarity=0.0,
            document_id=zh_test_data["doc_id"],
        )
        assert len(results) == 5  # document has exactly 5 chunks

    async def test_document_id_filter(self, zh_test_data, en_test_data, db):
        """Results must all belong to the filtered document."""
        results = await RetrievalService.retrieve(
            db, "市场分析", top_k=10, document_id=zh_test_data["doc_id"]
        )
        for r in results:
            assert r.document_id == zh_test_data["doc_id"]

    async def test_hybrid_mode_falls_back_to_semantic(self, zh_test_data, db):
        """mode='hybrid' must still return valid results (falls back to semantic)."""
        results = await RetrievalService.retrieve(
            db,
            "北京住宅成交",
            top_k=3,
            mode="hybrid",
            document_id=zh_test_data["doc_id"],
        )
        assert isinstance(results, list)
        assert len(results) > 0

    async def test_results_ordered_by_similarity_descending(self, zh_test_data, db):
        results = await RetrievalService.retrieve(
            db, "房地产市场", top_k=5, document_id=zh_test_data["doc_id"]
        )
        sims = [r.similarity for r in results]
        assert sims == sorted(sims, reverse=True), "Results must be sorted by similarity"


# ── Chinese accuracy ──────────────────────────────────────────────────────────


class TestChineseAccuracy:
    async def test_beijing_residential_query_top1(self, zh_test_data, db):
        """BGE correctly retrieves the Beijing residential chunk for a related query."""
        results = await RetrievalService.retrieve(
            db,
            "北京住宅市场成交量和价格走势分析",
            top_k=5,
            document_id=zh_test_data["doc_id"],
        )
        assert len(results) > 0
        # The Beijing residential chunk (index 0) must be the top result
        assert results[0].chunk_index == 0, (
            f"Expected chunk_index=0 (Beijing residential), got {results[0].chunk_index}. "
            f"Similarities: {[(r.chunk_index, r.similarity) for r in results]}"
        )

    async def test_shenzhen_office_query_top_results(self, zh_test_data, db):
        """BGE correctly retrieves the Shenzhen office chunk for an office-related query."""
        results = await RetrievalService.retrieve(
            db,
            "深圳写字楼租金空置率情况",
            top_k=3,
            document_id=zh_test_data["doc_id"],
        )
        assert len(results) > 0
        # Shenzhen office chunk (index 1) must be in the top 2 results
        top_indices = [r.chunk_index for r in results[:2]]
        assert 1 in top_indices, (
            f"Expected chunk_index=1 (Shenzhen office) in top-2, got {top_indices}. "
            f"All: {[(r.chunk_index, round(r.similarity, 4)) for r in results]}"
        )

    async def test_cross_topic_isolation(self, zh_test_data, db):
        """A real-estate query must NOT rank quantum computing as the top result."""
        results = await RetrievalService.retrieve(
            db,
            "北京住宅成交量价格",
            top_k=5,
            document_id=zh_test_data["doc_id"],
        )
        assert results[0].chunk_index != 2, (
            "Quantum computing chunk should not rank #1 for a real-estate query"
        )
        assert results[0].chunk_index != 3, (
            "Climate change chunk should not rank #1 for a real-estate query"
        )

    async def test_similarity_is_positive_for_relevant_query(self, zh_test_data, db):
        """Relevant query should yield positive cosine similarity for top result."""
        results = await RetrievalService.retrieve(
            db,
            "北京住宅市场报告",
            top_k=1,
            document_id=zh_test_data["doc_id"],
        )
        assert results[0].similarity > 0.5, (
            f"Expected similarity > 0.5 for relevant query, got {results[0].similarity}"
        )


# ── English query ─────────────────────────────────────────────────────────────


class TestEnglishQuery:
    async def test_english_query_returns_results(self, en_test_data, db):
        """BGE handles English queries and returns results."""
        results = await RetrievalService.retrieve(
            db,
            "New York housing market prices",
            top_k=3,
            document_id=en_test_data["doc_id"],
        )
        assert len(results) > 0

    async def test_english_query_correct_top_result(self, en_test_data, db):
        """English housing query correctly ranks the housing chunk first."""
        results = await RetrievalService.retrieve(
            db,
            "New York residential real estate transaction prices",
            top_k=3,
            document_id=en_test_data["doc_id"],
        )
        assert len(results) > 0
        assert results[0].chunk_index == 0, (
            f"Expected chunk_index=0 (NY housing), got "
            f"{[(r.chunk_index, round(r.similarity, 4)) for r in results]}"
        )

    async def test_english_similarities_in_valid_range(self, en_test_data, db):
        results = await RetrievalService.retrieve(
            db, "energy renewable solar wind", top_k=3, document_id=en_test_data["doc_id"]
        )
        for r in results:
            assert -1.01 <= r.similarity <= 1.01


# ── Result schema ─────────────────────────────────────────────────────────────


class TestResultSchema:
    async def test_result_has_all_fields(self, zh_test_data, db):
        results = await RetrievalService.retrieve(
            db, "市场报告", top_k=1, document_id=zh_test_data["doc_id"]
        )
        r = results[0]
        assert isinstance(r.chunk_id, str)
        assert isinstance(r.document_id, str)
        assert isinstance(r.file_name, str)
        assert isinstance(r.chunk_index, int)
        assert isinstance(r.chunk_text, str)
        assert isinstance(r.similarity, float)

    async def test_file_name_is_populated(self, zh_test_data, db):
        results = await RetrievalService.retrieve(
            db, "市场分析", top_k=1, document_id=zh_test_data["doc_id"]
        )
        assert results[0].file_name == "zh_accuracy_test.pdf"

    async def test_chunk_text_is_not_empty(self, zh_test_data, db):
        results = await RetrievalService.retrieve(
            db, "市场报告", top_k=5, document_id=zh_test_data["doc_id"]
        )
        for r in results:
            assert len(r.chunk_text.strip()) > 0
