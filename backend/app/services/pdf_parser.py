"""PDF parser using PyMuPDF (fitz).

Handles Chinese, English, multi-page, and large PDFs.
Raises ValueError for all invalid / unreadable inputs.
"""

import dataclasses
import logging

import fitz  # PyMuPDF

logger = logging.getLogger(__name__)


@dataclasses.dataclass(slots=True)
class ParseResult:
    pages: int
    characters: int
    text: str


class DocumentParser:
    """Stateless PDF parser."""

    @staticmethod
    def parse_pdf(file_bytes: bytes) -> ParseResult:
        """Parse PDF bytes into plain text.

        Supports:
        - Chinese PDFs (CJK Unicode via PyMuPDF's built-in renderer)
        - English PDFs
        - Multi-page PDFs (each page extracted individually)
        - Large PDFs (processed page-by-page; constant memory overhead)

        Returns:
            ParseResult with total page count, character count, and full text.

        Raises:
            ValueError: on empty input, corrupt data, or encrypted file.
        """
        try:
            doc: fitz.Document = fitz.open(stream=file_bytes, filetype="pdf")
        except fitz.EmptyFileError as exc:
            raise ValueError("PDF content is empty") from exc
        except fitz.FileDataError as exc:
            raise ValueError(f"Cannot open PDF — file may be corrupt: {exc}") from exc
        except Exception as exc:
            raise ValueError(f"PDF open error: {exc}") from exc

        try:
            if doc.is_encrypted:
                raise ValueError("Encrypted PDFs are not supported")

            page_count = len(doc)
            if page_count == 0:
                raise ValueError("PDF contains no pages")

            parts: list[str] = []
            for i in range(page_count):
                page: fitz.Page = doc[i]
                # get_text("text") extracts Unicode text, including CJK characters.
                # sort=True preserves natural reading order (top-to-bottom, left-to-right).
                text = page.get_text("text", sort=True).strip()
                if text:
                    parts.append(f"[第{i + 1}页]\n{text}")

        finally:
            doc.close()

        full_text = "\n\n".join(parts)
        logger.info(
            "Parsed PDF: %d pages, %d chars, %d non-empty pages",
            page_count,
            len(full_text),
            len(parts),
        )
        return ParseResult(
            pages=page_count,
            characters=len(full_text),
            text=full_text,
        )
