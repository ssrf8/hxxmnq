"""Prepare owner-supplied black-background character Boss sheets.

The supplied PNGs are already authored as a 1254x1254 2x2 sheet:
top-left idle, top-right spell, bottom-left hit, bottom-right break.
This script preserves the RGB-over-black appearance while deriving alpha,
clears hidden RGB, archives the exact owner inputs, and writes a QA report.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


SHEETS = {
    "image-1.png": "mystia",
    "image-2.png": "nitori",
    "image-3.png": "marisa",
    "image-4.png": "reimu",
    "image-5.png": "suika",
}
CHARACTER_ID_PATTERN = re.compile(r"^[a-z0-9_]+$")
CANVAS_SIZE = (1254, 1254)
CELL_SIZE = 627
BLACK_FLOOR = 8
ALPHA_GAIN = 3.5


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def alpha_bbox(alpha: np.ndarray) -> list[int] | None:
    ys, xs = np.nonzero(alpha)
    if not len(xs):
        return None
    return [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)]


def remove_black_background(source: Image.Image) -> Image.Image:
    rgb = np.asarray(source.convert("RGB"), dtype=np.uint8)
    peak = rgb.max(axis=2).astype(np.float32)
    alpha = np.clip((peak - BLACK_FLOOR) * ALPHA_GAIN, 0, 255)
    alpha = np.rint(alpha).astype(np.uint8)

    # The source was rendered over black. Un-premultiplying by the derived
    # alpha reproduces its authored appearance on a black battle backdrop
    # while allowing the project background to remain visible.
    rgba = np.zeros((*rgb.shape[:2], 4), dtype=np.uint8)
    visible = alpha > 0
    scale = np.zeros_like(peak, dtype=np.float32)
    scale[visible] = 255.0 / alpha[visible]
    recovered = np.clip(np.rint(rgb.astype(np.float32) * scale[:, :, None]), 0, 255).astype(np.uint8)
    rgba[visible, :3] = recovered[visible]
    rgba[:, :, 3] = alpha
    return Image.fromarray(rgba, "RGBA")


def cell_metrics(alpha: np.ndarray) -> list[dict[str, object]]:
    cells = []
    labels = ["idle", "spell", "hit", "break"]
    for index, label in enumerate(labels):
        x = (index % 2) * CELL_SIZE
        y = (index // 2) * CELL_SIZE
        cell = alpha[y : y + CELL_SIZE, x : x + CELL_SIZE]
        bbox = alpha_bbox(cell)
        cells.append(
            {
                "pose": label,
                "visible_bbox_in_cell": bbox,
                "visible_pixels": int(np.count_nonzero(cell)),
                "opaque_pixels": int(np.count_nonzero(cell == 255)),
            }
        )
    return cells


def checkerboard(size: tuple[int, int], step: int = 32) -> Image.Image:
    width, height = size
    board = Image.new("RGBA", size, (45, 48, 58, 255))
    draw = ImageDraw.Draw(board)
    for y in range(0, height, step):
        for x in range(0, width, step):
            if (x // step + y // step) % 2:
                draw.rectangle((x, y, x + step - 1, y + step - 1), fill=(73, 77, 91, 255))
    return board


def parse_explicit_sources(values: list[str]) -> list[tuple[Path, str]]:
    sources: list[tuple[Path, str]] = []
    seen: set[str] = set()
    for value in values:
        character_id, separator, source_value = value.partition("=")
        if not separator or not source_value:
            raise ValueError(f"--source must use CHARACTER_ID=PATH, got {value!r}")
        if not CHARACTER_ID_PATTERN.fullmatch(character_id):
            raise ValueError(f"invalid character id {character_id!r}")
        if character_id in seen:
            raise ValueError(f"duplicate character id {character_id!r}")
        seen.add(character_id)
        sources.append((Path(source_value), character_id))
    return sources


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path)
    parser.add_argument(
        "--source",
        action="append",
        default=[],
        metavar="CHARACTER_ID=PATH",
        help="process an explicit character source; repeat for multiple replacements",
    )
    parser.add_argument("--asset-dir", type=Path, default=Path("src/assets/battle/boss"))
    parser.add_argument(
        "--archive-dir",
        type=Path,
        default=Path("旧素材/素材处理/battle-boss-owner-source-v1"),
    )
    parser.add_argument("--archive-version", default="v1")
    parser.add_argument(
        "--report",
        type=Path,
        default=Path("project/character-boss-sheet-preparation-report.json"),
    )
    parser.add_argument(
        "--preview",
        type=Path,
        default=Path("project/character-boss-sheet-alpha-preview.png"),
    )
    args = parser.parse_args()

    if args.source:
        sources = parse_explicit_sources(args.source)
    else:
        if args.source_dir is None:
            parser.error("--source-dir is required unless at least one --source is provided")
        sources = [(args.source_dir / source_name, character_id) for source_name, character_id in SHEETS.items()]
    if not CHARACTER_ID_PATTERN.fullmatch(args.archive_version):
        parser.error("--archive-version must contain only lowercase letters, digits, and underscores")

    args.asset_dir.mkdir(parents=True, exist_ok=True)
    args.archive_dir.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.preview.parent.mkdir(parents=True, exist_ok=True)

    reports: list[dict[str, object]] = []
    preview = Image.new("RGBA", (len(sources) * 320, 320), (24, 26, 33, 255))

    for column, (source_path, character_id) in enumerate(sources):
        if not source_path.is_file():
            raise FileNotFoundError(source_path)
        with Image.open(source_path) as source:
            if source.size != CANVAS_SIZE:
                raise ValueError(f"{source_path} must be {CANVAS_SIZE}, got {source.size}")
            prepared = remove_black_background(source)

        archive_path = (
            args.archive_dir
            / f"{character_id}-battle-sheet-owner-black-{args.archive_version}.png"
        )
        output_path = args.asset_dir / f"{character_id}-battle-sheet-v1.png"
        shutil.copy2(source_path, archive_path)
        prepared.save(output_path, optimize=True)

        rgba = np.asarray(prepared, dtype=np.uint8)
        alpha = rgba[:, :, 3]
        if np.any((alpha == 0) & np.any(rgba[:, :, :3] != 0, axis=2)):
            raise ValueError(f"{output_path} retains hidden RGB")
        if any(cell["visible_pixels"] == 0 for cell in cell_metrics(alpha)):
            raise ValueError(f"{output_path} has an empty pose cell")

        thumb = prepared.resize((300, 300), Image.Resampling.LANCZOS)
        tile = checkerboard((320, 320))
        tile.alpha_composite(thumb, (10, 10))
        preview.alpha_composite(tile, (column * 320, 0))

        reports.append(
            {
                "character_id": character_id,
                "source_attachment_name": source_path.name,
                "source_sha256": sha256(source_path),
                "archive_path": archive_path.as_posix(),
                "archive_sha256": sha256(archive_path),
                "output_path": output_path.as_posix(),
                "output_sha256": sha256(output_path),
                "canvas": list(CANVAS_SIZE),
                "layout": "2x2-idle-spell-hit-break",
                "transparent_pixels": int(np.count_nonzero(alpha == 0)),
                "partial_alpha_pixels": int(np.count_nonzero((alpha > 0) & (alpha < 255))),
                "opaque_pixels": int(np.count_nonzero(alpha == 255)),
                "cells": cell_metrics(alpha),
            }
        )

    preview.convert("RGB").save(args.preview, quality=92)
    args.report.write_text(
        json.dumps(
            {
                "version": "character-boss-sheet-preparation.v2",
                "method": (
                    "deterministic black-background alpha derivation; "
                    f"black floor {BLACK_FLOOR}, alpha gain {ALPHA_GAIN}, "
                    "RGB un-premultiplication, hidden RGB cleared"
                ),
                "pose_order": ["idle", "spell", "hit", "break"],
                "assets": reports,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
