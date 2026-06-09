"""Integration tests for multimodal RAG (image → knowledge base).

Rules:
  - No mock Vision, no fake OCR — every test calls real Qwen-VL-Max via DashScope.
  - Real BGE model for embedding (module-scoped fixture).
  - Real PostgreSQL for storage.
  - DeepSeek is mocked for Q&A tests (to avoid extra cost and flakiness).

Test image:
  A PNG created with PyMuPDF containing Chinese + English text about real estate.
  Used to verify OCR and semantic retrieval.

Fixture strategy:
  - `test_png_bytes`  — pure, creates image once per module (no I/O)
  - `bge_model`       — loads BGE once; clears after module
  - `indexed_image`   — calls real Qwen-VL + BGE, indexes into DB; module-scoped
  - `db`              — function-scoped fresh engine (from conftest.py)

Test groups:
  TestOCR          — Qwen-VL produced a real analysis with expected fields
  TestIndexing     — document/chunks/embeddings exist in DB after indexing
  TestRetrieval    — image content is searchable via RetrievalService
  TestImageQA      — Q&A via KnowledgeAgent returns answer with image sources
"""

import asyncio
import uuid

import fitz  # pymupdf — already in requirements
import pytest
from sentence_transformers import SentenceTransformer
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.agents.knowledge_agent as agent_module
from app.agents.knowledge_agent import KnowledgeAgent
from app.core.config import settings
from app.services.embedding_service import EmbeddingService
from app.services.multimodal_service import ImageIndexResult, MultimodalIndexService
from app.services.retrieval_service import RetrievalService

# ── Test image content (must survive Qwen-VL OCR) ─────────────────────────────

_TEXT_LINES = [
    "北京市朝阳区房地产市场年度报告",
    "2026年一季度成交均价：85000元/平米",
    "成交量同比增长12%  市场整体活跃",
    "Beijing Chaoyang Real Estate Report 2026",
]


# ── Module-scoped fixtures ─────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def test_png_bytes() -> bytes:
    """Create a real PNG with Chinese + English text using PyMuPDF.

    The image is 600×280 px at 150 DPI — readable by Qwen-VL for OCR.
    """
    doc = fitz.open()
    page = doc.new_page(width=600, height=280)
    for i, line in enumerate(_TEXT_LINES):
        page.insert_text(
            fitz.Point(20, 60 + i * 50),
            line,
            fontsize=18,
            color=(0, 0, 0),
        )
    pix = page.get_pixmap(dpi=150)
    return pix.tobytes("png")


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
def indexed_image(bge_model, test_png_bytes) -> ImageIndexResult:
    """Upload + index the test PNG via real Qwen-VL + BGE.

    This is the only place where the real Qwen-VL API is called.
    All tests in this module share this single indexed document.
    """

    async def _do_index():
        engine = _make_engine()
        factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with factory() as db:
            result = await MultimodalIndexService.index_image(
                db=db,
                file_bytes=test_png_bytes,
                content_type="image/png",
                filename="test_realestate_beijing.png",
            )
        await engine.dispose()
        return result

    result = _run(_do_index())
    yield result

    async def _teardown():
        engine = _make_engine()
        factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with factory() as db:
            await db.execute(
                text(f"DELETE FROM knowledge_documents WHERE id = '{result.document_id}'::uuid")
            )
            await db.commit()
        await engine.dispose()

    _run(_teardown())


# ── OCR / Vision quality tests ────────────────────────────────────────────────


class TestOCR:
    def test_analysis_has_summary(self, indexed_image: ImageIndexResult):
        """Qwen-VL must return a non-empty summary for the image."""
        assert indexed_image.analysis.summary, "summary must not be empty"
        assert len(indexed_image.analysis.summary) >= 10

    def test_analysis_has_tags(self, indexed_image: ImageIndexResult):
        """Qwen-VL must generate keyword tags."""
        assert len(indexed_image.analysis.tags) > 0, "tags must not be empty"

    def test_ocr_or_scene_populated(self, indexed_image: ImageIndexResult):
        """Qwen-VL must provide either OCR text OR a scene description."""
        has_ocr = len(indexed_image.analysis.texts) > 0
        has_scene = bool(indexed_image.analysis.scene)
        has_objects = len(indexed_image.analysis.objects) > 0
        assert has_ocr or has_scene or has_objects, (
            "Qwen-VL produced no OCR text, no scene, and no objects — "
            "analysis appears completely empty"
        )

    def test_real_analysis_not_fallback(self, indexed_image: ImageIndexResult):
        """Verify the analysis is real content, not the _extract_json fallback."""
        # The fallback produces minimal fields with empty lists.
        # A real analysis should have at least summary + tags.
        assert indexed_image.analysis.summary
        assert indexed_image.analysis.tags

    def test_knowledge_text_contains_summary(self, indexed_image: ImageIndexResult):
        """The knowledge text built from analysis must include the summary."""
        from app.services.image_agent import ImageAgent

        text = ImageAgent.build_knowledge_text(
            indexed_image.analysis, indexed_image.file_name
        )
        assert indexed_image.analysis.summary[:50] in text

    def test_knowledge_text_includes_filename(self, indexed_image: ImageIndexResult):
        from app.services.image_agent import ImageAgent

        text = ImageAgent.build_knowledge_text(
            indexed_image.analysis, indexed_image.file_name
        )
        assert indexed_image.file_name in text


# ── DB indexing tests ─────────────────────────────────────────────────────────


class TestIndexing:
    async def test_document_exists_in_db(self, indexed_image: ImageIndexResult, db):
        """knowledge_documents row must exist for the indexed image."""
        row = await db.execute(
            text(
                f"SELECT id, file_name, file_type FROM knowledge_documents "
                f"WHERE id = '{indexed_image.document_id}'::uuid"
            )
        )
        result = row.fetchone()
        assert result is not None, "Document not found in knowledge_documents"
        assert result[1] == "test_realestate_beijing.png"
        assert result[2] == "image/png"

    async def test_chunks_exist(self, indexed_image: ImageIndexResult, db):
        """knowledge_chunks must have at least one row for this document."""
        assert indexed_image.chunk_count > 0, "No chunks were created"
        row = await db.execute(
            text(
                f"SELECT COUNT(*) FROM knowledge_chunks "
                f"WHERE document_id = '{indexed_image.document_id}'::uuid"
            )
        )
        count = row.scalar()
        assert count == indexed_image.chunk_count

    async def test_embeddings_exist(self, indexed_image: ImageIndexResult, db):
        """knowledge_embeddings must have one row per chunk."""
        assert indexed_image.embedding_count > 0
        row = await db.execute(
            text(
                f"SELECT COUNT(*) FROM knowledge_embeddings ke "
                f"JOIN knowledge_chunks kc ON ke.chunk_id = kc.id "
                f"WHERE kc.document_id = '{indexed_image.document_id}'::uuid"
            )
        )
        count = row.scalar()
        assert count == indexed_image.embedding_count

    def test_embedding_count_equals_chunk_count(self, indexed_image: ImageIndexResult):
        assert indexed_image.embedding_count == indexed_image.chunk_count

    def test_result_has_presigned_url(self, indexed_image: ImageIndexResult):
        assert indexed_image.image_url.startswith("http")
        assert "knowledge-images" in indexed_image.minio_path


# ── Retrieval tests ────────────────────────────────────────────────────────────


class TestRetrieval:
    async def test_image_content_is_searchable(self, indexed_image: ImageIndexResult, db):
        """RetrievalService must find chunks from the indexed image."""
        results = await RetrievalService.retrieve(
            db,
            "北京房地产市场报告",
            top_k=5,
            document_id=indexed_image.document_id,
        )
        assert len(results) > 0, "No results for a directly relevant query"

    async def test_retrieved_chunks_belong_to_image_doc(
        self, indexed_image: ImageIndexResult, db
    ):
        results = await RetrievalService.retrieve(
            db,
            "房地产市场",
            top_k=5,
            document_id=indexed_image.document_id,
        )
        for r in results:
            assert r.document_id == indexed_image.document_id
            assert r.file_name == "test_realestate_beijing.png"

    async def test_global_search_finds_image(self, indexed_image: ImageIndexResult, db):
        """Global search (no document_id filter) must include image content."""
        results = await RetrievalService.retrieve(
            db,
            "北京房地产",
            top_k=10,
        )
        doc_ids = {r.document_id for r in results}
        assert indexed_image.document_id in doc_ids, (
            "Image document not found in global search results"
        )

    async def test_similarity_above_threshold(self, indexed_image: ImageIndexResult, db):
        """Top result for a relevant query must have reasonable similarity."""
        results = await RetrievalService.retrieve(
            db,
            "朝阳区房地产报告",
            top_k=1,
            document_id=indexed_image.document_id,
        )
        assert len(results) > 0
        assert results[0].similarity > 0.3, (
            f"Similarity too low: {results[0].similarity:.4f}"
        )


# ── Image Q&A tests ────────────────────────────────────────────────────────────


class TestImageQA:
    async def test_agent_answers_about_image(
        self, indexed_image: ImageIndexResult, db, monkeypatch
    ):
        """KnowledgeAgent must return an answer with image-sourced content."""
        monkeypatch.setattr(agent_module, "_call_deepseek", _fake_answer("北京房市答案"))
        result = await KnowledgeAgent.run(
            db,
            "北京朝阳区房地产市场",
            document_id=indexed_image.document_id,
        )
        assert result.answer == "北京房市答案"
        assert len(result.sources) > 0

    async def test_sources_point_to_image_document(
        self, indexed_image: ImageIndexResult, db, monkeypatch
    ):
        """Sources returned by KnowledgeAgent must reference the image document."""
        monkeypatch.setattr(agent_module, "_call_deepseek", _fake_answer("答案"))
        result = await KnowledgeAgent.run(
            db,
            "房地产市场报告",
            document_id=indexed_image.document_id,
        )
        for s in result.sources:
            assert s["document_id"] == indexed_image.document_id
            assert s["file_name"] == "test_realestate_beijing.png"

    async def test_retrieval_not_bypassed(
        self, indexed_image: ImageIndexResult, db, monkeypatch
    ):
        """Retrieval must always run — verified by sources from real DB."""
        monkeypatch.setattr(agent_module, "_call_deepseek", _fake_answer("答案"))
        result = await KnowledgeAgent.run(
            db,
            "北京成交均价",
            document_id=indexed_image.document_id,
        )
        # If retrieval ran, sources will have real UUIDs (36 chars)
        assert len(result.sources) > 0
        for s in result.sources:
            assert len(s["chunk_id"]) == 36


# ── Helper ─────────────────────────────────────────────────────────────────────


def _fake_answer(text: str):
    async def fake(messages):
        return text
    return fake
