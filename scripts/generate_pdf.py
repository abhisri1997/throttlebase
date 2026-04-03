#!/usr/bin/env python3

from __future__ import annotations

import re
import sys
import textwrap
from dataclasses import dataclass
from pathlib import Path


PAGE_WIDTH = 612
PAGE_HEIGHT = 792
LEFT_MARGIN = 54
RIGHT_MARGIN = 54
TOP_MARGIN = 54
BOTTOM_MARGIN = 54


@dataclass
class StyledLine:
    text: str
    font: str
    size: int
    indent: int = 0
    gap_before: int = 0
    gap_after: int = 4


def parse_markdown(source: str) -> list[StyledLine]:
    output: list[StyledLine] = []

    for raw_line in source.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()

        if not stripped:
            output.append(StyledLine("", "F1", 11, gap_before=0, gap_after=8))
            continue

        if stripped.startswith("# "):
            output.append(StyledLine(stripped[2:].strip(), "F2", 18, gap_before=12, gap_after=8))
            continue

        if stripped.startswith("## "):
            output.append(StyledLine(stripped[3:].strip(), "F2", 15, gap_before=10, gap_after=6))
            continue

        if stripped.startswith("### "):
            output.append(StyledLine(stripped[4:].strip(), "F2", 12, gap_before=8, gap_after=4))
            continue

        if re.match(r"^\d+\.\s+", stripped):
            output.append(StyledLine(stripped, "F1", 11, indent=18))
            continue

        if stripped.startswith("- "):
            output.append(StyledLine(stripped, "F1", 11, indent=18))
            continue

        output.append(StyledLine(stripped, "F1", 11))

    return output


def wrap_line(item: StyledLine) -> list[str]:
    if not item.text:
        return [""]

    usable_width = PAGE_WIDTH - LEFT_MARGIN - RIGHT_MARGIN - item.indent
    approx_char_width = max(item.size * 0.52, 4.0)
    width_chars = max(int(usable_width / approx_char_width), 20)

    return textwrap.wrap(
        item.text,
        width=width_chars,
        break_long_words=False,
        break_on_hyphens=False,
    ) or [item.text]


def escape_pdf_text(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
    )


def build_page_streams(items: list[StyledLine]) -> list[str]:
    pages: list[list[str]] = [[]]
    y = PAGE_HEIGHT - TOP_MARGIN

    for item in items:
        wrapped = wrap_line(item)
        line_height = item.size + 3

        y -= item.gap_before

        for index, wrapped_line in enumerate(wrapped):
            if y - line_height < BOTTOM_MARGIN:
                pages.append([])
                y = PAGE_HEIGHT - TOP_MARGIN

            x = LEFT_MARGIN + item.indent
            pages[-1].append(
                f"BT /{item.font} {item.size} Tf 1 0 0 1 {x} {y} Tm ({escape_pdf_text(wrapped_line)}) Tj ET"
            )
            y -= line_height

            if index < len(wrapped) - 1 and y - line_height < BOTTOM_MARGIN:
                pages.append([])
                y = PAGE_HEIGHT - TOP_MARGIN

        y -= item.gap_after

    return ["\n".join(page) for page in pages if page]


def pdf_object(data: bytes) -> bytes:
    return data + b"\n"


def generate_pdf(markdown_text: str) -> bytes:
    items = parse_markdown(markdown_text)
    page_streams = build_page_streams(items)

    objects: list[bytes] = []

    def add_object(payload: bytes) -> int:
        objects.append(pdf_object(payload))
        return len(objects)

    font_regular_id = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    font_bold_id = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")

    content_ids: list[int] = []
    page_ids: list[int] = []

    for stream in page_streams:
        encoded = stream.encode("utf-8")
        content_ids.append(
            add_object(
                b"<< /Length " + str(len(encoded)).encode("ascii") + b" >>\nstream\n" + encoded + b"\nendstream"
            )
        )

    pages_id = add_object(b"<< /Type /Pages /Kids [] /Count 0 >>")

    for content_id in content_ids:
        page_ids.append(
            add_object(
                (
                    "<< /Type /Page /Parent {pages} 0 R /MediaBox [0 0 612 792] "
                    "/Resources << /Font << /F1 {f1} 0 R /F2 {f2} 0 R >> >> "
                    "/Contents {content} 0 R >>"
                )
                .format(pages=pages_id, f1=font_regular_id, f2=font_bold_id, content=content_id)
                .encode("ascii")
            )
        )

    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    objects[pages_id - 1] = pdf_object(
        f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode("ascii")
    )

    catalog_id = add_object(f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode("ascii"))

    result = bytearray(b"%PDF-1.4\n")
    offsets = [0]

    for index, obj in enumerate(objects, start=1):
        offsets.append(len(result))
        result.extend(f"{index} 0 obj\n".encode("ascii"))
        result.extend(obj)
        result.extend(b"endobj\n")

    xref_offset = len(result)
    result.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    result.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        result.extend(f"{offset:010d} 00000 n \n".encode("ascii"))

    result.extend(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_id} 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF\n"
        ).encode("ascii")
    )

    return bytes(result)


def main() -> int:
    if len(sys.argv) not in (2, 3):
        print("Usage: generate_pdf.py <input.md> [output.pdf]", file=sys.stderr)
        return 1

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2]) if len(sys.argv) == 3 else input_path.with_suffix(".pdf")

    if not input_path.exists():
        print(f"Input file not found: {input_path}", file=sys.stderr)
        return 1

    markdown_text = input_path.read_text(encoding="utf-8")
    pdf_bytes = generate_pdf(markdown_text)
    output_path.write_bytes(pdf_bytes)
    print(f"Wrote PDF to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())