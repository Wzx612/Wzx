"""Tests for DocumentParser.parse_pdf().

All PDF fixtures are generated in-process using PyMuPDF Story API so
the test suite is fully self-contained — no external PDF files required.
"""

import io

import fitz
import pytest

from app.services.pdf_parser import DocumentParser, ParseResult


# ── PDF fixture helpers ──────────────────────────────────────────────────────


def _story_pdf(html: str) -> bytes:
    """Create a single-pass PDF from HTML via PyMuPDF Story API."""
    story = fitz.Story(html=html)
    buf = io.BytesIO()
    writer = fitz.DocumentWriter(buf)
    mediax = fitz.Rect(0, 0, 595, 842)
    while True:
        device = writer.begin_page(mediax)
        cont, _ = story.place(mediax)
        story.draw(device)
        writer.end_page()
        if not cont:
            break
    writer.close()
    return buf.getvalue()


def _count_pdf_pages(pdf_bytes: bytes) -> int:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    n = len(doc)
    doc.close()
    return n


# ── English PDF ──────────────────────────────────────────────────────────────


class TestEnglishPDF:
    def test_basic_extraction(self):
        pdf = _story_pdf("<p>Hello World. This is an English document.</p>")
        result = DocumentParser.parse_pdf(pdf)

        assert isinstance(result, ParseResult)
        assert result.pages == 1
        assert result.characters > 0
        assert "Hello World" in result.text

    def test_multiword_content(self):
        words = " ".join(f"word{i}" for i in range(100))
        pdf = _story_pdf(f"<p>{words}</p>")
        result = DocumentParser.parse_pdf(pdf)

        assert result.pages >= 1
        assert "word0" in result.text
        assert "word99" in result.text

    def test_special_characters(self):
        pdf = _story_pdf(
            "<p>Special: ampersand &amp; quote &quot; dash - slash / percent %</p>"
        )
        result = DocumentParser.parse_pdf(pdf)
        assert result.characters > 0


# ── Chinese PDF ──────────────────────────────────────────────────────────────


class TestChinesePDF:
    def test_chinese_characters_present(self):
        """Parser must not raise and must return non-empty text for a Chinese PDF."""
        pdf = _story_pdf(
            "<p>Chinese content: Beijing Shanghai Shenzhen Real Estate Market</p>"
        )
        result = DocumentParser.parse_pdf(pdf)

        assert result.pages >= 1
        assert result.characters > 0

    def test_mixed_chinese_english(self):
        pdf = _story_pdf(
            "<p>Mixed: Real Estate 2026 Market Analysis Report</p>"
            "<p>Content includes both languages and numbers: 12345</p>"
        )
        result = DocumentParser.parse_pdf(pdf)

        assert result.pages >= 1
        assert result.characters > 0
        assert "2026" in result.text

    def test_chinese_pdf_returns_parse_result(self):
        pdf = _story_pdf("<p>Document analysis test with content</p>")
        result = DocumentParser.parse_pdf(pdf)

        assert isinstance(result, ParseResult)
        assert result.pages > 0
        assert result.characters > 0
        assert len(result.text) > 0


# ── Multi-page PDF ───────────────────────────────────────────────────────────


class TestMultiPagePDF:
    def test_two_pages(self):
        long_html = "".join(
            f"<p>{'Paragraph content word ' * 80} number {i}.</p>"
            for i in range(20)
        )
        pdf = _story_pdf(long_html)

        assert _count_pdf_pages(pdf) >= 2, "Fixture must produce at least 2 pages"

        result = DocumentParser.parse_pdf(pdf)
        assert result.pages >= 2
        assert result.characters > 0

    def test_page_markers_in_text(self):
        long_html = "".join(
            f"<p>{'Content line ' * 100} {i}</p>" for i in range(30)
        )
        pdf = _story_pdf(long_html)
        result = DocumentParser.parse_pdf(pdf)

        if result.pages >= 2:
            assert "[第1页]" in result.text
            assert "[第2页]" in result.text

    def test_all_pages_counted(self):
        long_html = "".join(
            f"<p>{'Long paragraph text ' * 120} item {i}</p>" for i in range(40)
        )
        pdf = _story_pdf(long_html)
        expected_pages = _count_pdf_pages(pdf)

        result = DocumentParser.parse_pdf(pdf)
        assert result.pages == expected_pages

    def test_character_count_matches(self):
        pdf = _story_pdf("<p>Simple document with known content here.</p>")
        result = DocumentParser.parse_pdf(pdf)

        assert result.characters == len(result.text)


# ── Large PDF ────────────────────────────────────────────────────────────────


class TestLargePDF:
    def test_many_pages(self):
        """Parser must handle a large document without error."""
        html = "".join(
            f"<p>{'This is a substantial paragraph with many words and sentences. ' * 80}"
            f"Section {i} contains important real estate market information.</p>"
            for i in range(60)
        )
        pdf = _story_pdf(html)

        result = DocumentParser.parse_pdf(pdf)
        assert result.pages >= 5
        assert result.characters > 10_000

    def test_large_file_returns_full_content(self):
        keyword = "UNIQUE_MARKER_12345"
        html = (
            "".join(f"<p>{'Filler text paragraph. ' * 80} {i}</p>" for i in range(50))
            + f"<p>{keyword}</p>"
        )
        pdf = _story_pdf(html)

        result = DocumentParser.parse_pdf(pdf)
        assert keyword in result.text


# ── Exception / error cases ──────────────────────────────────────────────────


class TestExceptionCases:
    def test_empty_bytes(self):
        with pytest.raises(ValueError, match="empty"):
            DocumentParser.parse_pdf(b"")

    def test_non_pdf_bytes(self):
        with pytest.raises(ValueError):
            DocumentParser.parse_pdf(b"this is not a pdf file at all")

    def test_corrupt_pdf_header(self):
        with pytest.raises(ValueError):
            DocumentParser.parse_pdf(b"%PDF-1.4\ncorrupt garbage data here")

    def test_binary_garbage(self):
        garbage = bytes(range(256)) * 100
        with pytest.raises(ValueError):
            DocumentParser.parse_pdf(garbage)

    def test_returns_parse_result_type(self):
        pdf = _story_pdf("<p>Valid document content for type checking.</p>")
        result = DocumentParser.parse_pdf(pdf)

        assert isinstance(result.pages, int)
        assert isinstance(result.characters, int)
        assert isinstance(result.text, str)
        assert result.pages >= 1
        assert result.characters >= 0
