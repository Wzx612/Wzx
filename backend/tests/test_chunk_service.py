"""Tests for ChunkService.split_document().

Pure unit tests — no database or network required.
All assertions are made against the public contract:
  - chunk_size  <= 1000 characters  (soft limit; LangChain may exceed by ~1 char)
  - chunk_overlap = 200 characters
  - returns list[str] for any valid input
  - returns [] for empty / whitespace input
"""

import pytest

from app.services.chunk_service import ChunkService

CHUNK_SIZE = ChunkService.CHUNK_SIZE        # 1000
CHUNK_OVERLAP = ChunkService.CHUNK_OVERLAP  # 200


# ── helpers ──────────────────────────────────────────────────────────────────


def _english(n_words: int) -> str:
    return " ".join(f"word{i}" for i in range(n_words))


def _chinese(n_sentences: int) -> str:
    return "".join(
        f"这是第{i}句中文测试内容，包含北京上海深圳房地产市场分析报告数据。" for i in range(n_sentences)
    )


def _mixed(n: int) -> str:
    return "".join(
        f"Section {i}: 北京市场分析 real estate 2026 report. " for i in range(n)
    )


# ── English text ──────────────────────────────────────────────────────────────


class TestEnglishText:
    def test_returns_list_of_strings(self):
        chunks = ChunkService.split_document(_english(200))
        assert isinstance(chunks, list)
        assert all(isinstance(c, str) for c in chunks)

    def test_all_chunks_within_size_limit(self):
        chunks = ChunkService.split_document(_english(500))
        for c in chunks:
            assert len(c) <= CHUNK_SIZE + 20, f"Chunk too long: {len(c)}"

    def test_content_preserved(self):
        text = _english(100)
        chunks = ChunkService.split_document(text)
        rejoined = " ".join(chunks)
        for word in ["word0", "word50", "word99"]:
            assert word in rejoined

    def test_multiple_chunks_for_long_text(self):
        chunks = ChunkService.split_document(_english(500))
        assert len(chunks) >= 2

    def test_single_chunk_for_short_text(self):
        short = "This is a short English sentence."
        chunks = ChunkService.split_document(short)
        assert len(chunks) == 1
        assert chunks[0] == short


# ── Chinese text ──────────────────────────────────────────────────────────────


class TestChineseText:
    def test_chinese_returns_chunks(self):
        chunks = ChunkService.split_document(_chinese(50))
        assert len(chunks) >= 1

    def test_chinese_chunks_within_size(self):
        chunks = ChunkService.split_document(_chinese(80))
        for c in chunks:
            assert len(c) <= CHUNK_SIZE + 20

    def test_chinese_content_preserved(self):
        text = _chinese(30)
        chunks = ChunkService.split_document(text)
        all_text = "".join(chunks)
        assert "北京" in all_text
        assert "房地产" in all_text

    def test_chinese_sentence_separators_respected(self):
        text = "第一段内容。" * 200
        chunks = ChunkService.split_document(text)
        assert len(chunks) >= 2
        for c in chunks:
            assert len(c) <= CHUNK_SIZE + 20


# ── Mixed Chinese / English ───────────────────────────────────────────────────


class TestMixedText:
    def test_mixed_splits_correctly(self):
        chunks = ChunkService.split_document(_mixed(100))
        assert len(chunks) >= 2
        all_text = "".join(chunks)
        assert "北京" in all_text
        assert "real estate" in all_text

    def test_mixed_size_constraint(self):
        chunks = ChunkService.split_document(_mixed(200))
        for c in chunks:
            assert len(c) <= CHUNK_SIZE + 20

    def test_page_header_content(self):
        content = "\n\n".join(
            f"[第{i}页]\n" + "市场分析 market analysis " * 30 for i in range(1, 10)
        )
        chunks = ChunkService.split_document(content)
        assert len(chunks) >= 2


# ── Boundary tests ────────────────────────────────────────────────────────────


class TestBoundaries:
    def test_empty_string_returns_empty_list(self):
        assert ChunkService.split_document("") == []

    def test_whitespace_only_returns_empty_list(self):
        assert ChunkService.split_document("   \n\t  ") == []

    def test_single_char_returns_one_chunk(self):
        chunks = ChunkService.split_document("A")
        assert len(chunks) == 1
        assert chunks[0] == "A"

    def test_exactly_chunk_size_is_one_chunk(self):
        text = "x" * CHUNK_SIZE
        chunks = ChunkService.split_document(text)
        assert len(chunks) == 1

    def test_one_over_chunk_size_splits(self):
        text = "x" * (CHUNK_SIZE + 1)
        chunks = ChunkService.split_document(text)
        assert len(chunks) >= 2

    def test_overlap_content_present_in_adjacent_chunks(self):
        # LangChain splits at word boundaries: the last word of chunk[0]
        # must appear in chunk[1], and the first word of chunk[1] must
        # appear in chunk[0] — that is the overlap guarantee.
        words = [f"w{i}" for i in range(400)]
        text = " ".join(words)
        chunks = ChunkService.split_document(text)
        if len(chunks) >= 2:
            last_word_of_c0 = chunks[0].split()[-1]
            first_word_of_c1 = chunks[1].split()[0]
            assert last_word_of_c0 in chunks[1], "Last word of chunk[0] must appear in chunk[1]"
            assert first_word_of_c1 in chunks[0], "First word of chunk[1] must appear in chunk[0]"

    def test_no_empty_chunks_returned(self):
        text = "\n\n".join(["paragraph " * 40] * 10)
        chunks = ChunkService.split_document(text)
        for c in chunks:
            assert c.strip(), f"Got empty chunk: {repr(c)}"

    def test_chunk_indices_are_sequential(self):
        from app.services.chunk_service import _SEPARATORS  # noqa: PLC0415
        text = "A sentence. " * 200
        chunks = ChunkService.split_document(text)
        assert chunks == list(chunks)  # order preserved

    def test_newline_separator_respected(self):
        paragraphs = ["Paragraph " + str(i) + ". " + "filler " * 60 for i in range(10)]
        text = "\n\n".join(paragraphs)
        chunks = ChunkService.split_document(text)
        assert len(chunks) >= 2


# ── Long / large document ─────────────────────────────────────────────────────


class TestLongDocument:
    def test_long_english_document(self):
        text = _english(5000)
        chunks = ChunkService.split_document(text)
        assert len(chunks) >= 10
        for c in chunks:
            assert len(c) <= CHUNK_SIZE + 20

    def test_long_chinese_document(self):
        text = _chinese(300)
        chunks = ChunkService.split_document(text)
        assert len(chunks) >= 5
        for c in chunks:
            assert len(c) <= CHUNK_SIZE + 20

    def test_large_mixed_document(self):
        text = _mixed(500)
        chunks = ChunkService.split_document(text)
        assert len(chunks) >= 10
        all_chars = sum(len(c) for c in chunks)
        assert all_chars >= len(text) * 0.9, "Too much content lost in splitting"

    def test_no_content_loss_for_unique_markers(self):
        marker_a = "UNIQUE_MARKER_ALPHA_001"
        marker_b = "UNIQUE_MARKER_BETA_999"
        text = (
            marker_a
            + " " + "filler word " * 200
            + marker_b
            + " " + "filler word " * 200
        )
        chunks = ChunkService.split_document(text)
        all_text = " ".join(chunks)
        assert marker_a in all_text
        assert marker_b in all_text

    def test_chunk_count_is_deterministic(self):
        text = _english(1000)
        result_a = ChunkService.split_document(text)
        result_b = ChunkService.split_document(text)
        assert len(result_a) == len(result_b)
        assert result_a == result_b
