"""Recursive character text splitter for RAG chunking."""

from __future__ import annotations


_SEPARATORS = ["\n\n", "\n", "。", "！", "？", ".", "!", "?", " ", ""]


def split_text(
    text: str,
    chunk_size: int = 800,
    chunk_overlap: int = 100,
    separators: list[str] | None = None,
) -> list[str]:
    """Recursively split text into chunks of at most chunk_size characters."""
    seps = separators if separators is not None else _SEPARATORS
    return _recursive_split(text.strip(), chunk_size, chunk_overlap, seps)


def _recursive_split(
    text: str,
    chunk_size: int,
    chunk_overlap: int,
    separators: list[str],
) -> list[str]:
    if len(text) <= chunk_size:
        return [text] if text.strip() else []

    sep = separators[0] if separators else ""
    remaining_seps = separators[1:] if separators else []

    if sep:
        splits = text.split(sep)
    else:
        # Final fallback: hard split by char
        return _merge_splits(
            [text[i : i + chunk_size] for i in range(0, len(text), chunk_size - chunk_overlap)],
            chunk_size,
            chunk_overlap,
            sep,
        )

    good_splits: list[str] = []
    current: list[str] = []

    for split in splits:
        if not split.strip():
            continue
        if len(sep.join(current + [split])) <= chunk_size:
            current.append(split)
        else:
            if current:
                good_splits.append(sep.join(current))
            # If single split is still too large, recurse with next separator
            if len(split) > chunk_size and remaining_seps:
                good_splits.extend(_recursive_split(split, chunk_size, chunk_overlap, remaining_seps))
            else:
                current = [split]

    if current:
        good_splits.append(sep.join(current))

    return _merge_splits(good_splits, chunk_size, chunk_overlap, sep)


def _merge_splits(
    splits: list[str],
    chunk_size: int,
    chunk_overlap: int,
    separator: str,
) -> list[str]:
    chunks: list[str] = []
    current_parts: list[str] = []
    current_len = 0

    for part in splits:
        part_len = len(part)
        if current_len + part_len > chunk_size and current_parts:
            chunks.append(separator.join(current_parts))
            # Keep overlap
            while current_parts and current_len > chunk_overlap:
                removed = current_parts.pop(0)
                current_len -= len(removed) + len(separator)
        current_parts.append(part)
        current_len += part_len + len(separator)

    if current_parts:
        chunks.append(separator.join(current_parts))

    return [c for c in chunks if c.strip()]
