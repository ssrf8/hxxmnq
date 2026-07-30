#!/usr/bin/env python3
"""Normalize the owner-provided shared ruin into each V3 facility canvas."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "旧素材/素材处理/facility-ruin-shared-v3/facility-ruin-owner-source-v1.png"
REPORT = ROOT / "project/shared-facility-ruin-report.json"
PREVIEW = ROOT / "旧素材/素材处理/facility-ruin-shared-v3/shared-ruins-map-preview.png"
ALPHA_CROP_THRESHOLD = 8
SAFETY_BORDER = 24

TARGETS = {
    "fairy_garden": {
        "path": ROOT / "src/assets/world/map-facilities/fairy-garden/fairy-garden-ruins-v3.png",
        "size": (592, 464),
        "content_bottom": 437,
    },
    "moon_spring": {
        "path": ROOT / "src/assets/world/map-facilities/moon-spring/moon-spring-ruins-v3.png",
        "size": (624, 464),
        "content_bottom": 434,
    },
    "banquet_plaza": {
        "path": ROOT / "src/assets/world/map-facilities/banquet-plaza/banquet-plaza-ruins-v3.png",
        "size": (656, 464),
        "content_bottom": 437,
    },
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def visible_bbox(image: Image.Image, threshold: int) -> tuple[int, int, int, int]:
    alpha = np.asarray(image, dtype=np.uint8)[:, :, 3]
    ys, xs = np.where(alpha >= threshold)
    if not len(xs):
        raise ValueError(f"{image} has no pixels at alpha >= {threshold}")
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def clear_hidden_rgb(image: Image.Image, alpha_threshold: int = 1) -> Image.Image:
    rgba = np.array(image.convert("RGBA"), dtype=np.uint8, copy=True)
    transparent = rgba[:, :, 3] < alpha_threshold
    rgba[transparent] = 0
    return Image.fromarray(rgba, "RGBA")


def normalize(source: Image.Image, size: tuple[int, int], content_bottom: int) -> Image.Image:
    source_bbox = visible_bbox(source, ALPHA_CROP_THRESHOLD)
    crop = np.array(source.crop(source_bbox).convert("RGBA"), dtype=np.uint8, copy=True)
    crop[crop[:, :, 3] < ALPHA_CROP_THRESHOLD] = 0
    cropped = Image.fromarray(crop, "RGBA")

    target_width = size[0] - SAFETY_BORDER * 2
    scale = target_width / cropped.width
    target_height = round(cropped.height * scale)
    if target_height > size[1] - SAFETY_BORDER * 2:
        target_height = size[1] - SAFETY_BORDER * 2
        target_width = round(cropped.width * target_height / cropped.height)

    # Resize premultiplied RGBA so transparent source RGB cannot create a dark fringe.
    resized = cropped.convert("RGBa").resize(
        (target_width, target_height),
        Image.Resampling.LANCZOS,
    ).convert("RGBA")
    resized = clear_hidden_rgb(resized, 2)

    x = (size[0] - target_width) // 2
    y = content_bottom - target_height
    if x < SAFETY_BORDER or y < SAFETY_BORDER or content_bottom > size[1] - SAFETY_BORDER:
        raise ValueError(f"normalized ruin violates safety border for canvas {size}")

    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.alpha_composite(resized, (x, y))
    return clear_hidden_rgb(canvas)


def validate(image: Image.Image, expected_size: tuple[int, int]) -> dict[str, object]:
    if image.mode != "RGBA" or image.size != expected_size:
        raise ValueError(f"invalid output contract: mode={image.mode}, size={image.size}")
    rgba = np.asarray(image, dtype=np.uint8)
    alpha = rgba[:, :, 3]
    if np.any((alpha == 0) & np.any(rgba[:, :, :3] != 0, axis=2)):
        raise ValueError("transparent pixels retain hidden RGB")
    border = np.concatenate(
        (
            alpha[:SAFETY_BORDER, :].ravel(),
            alpha[-SAFETY_BORDER:, :].ravel(),
            alpha[:, :SAFETY_BORDER].ravel(),
            alpha[:, -SAFETY_BORDER:].ravel(),
        )
    )
    if np.any(border):
        raise ValueError(f"output lacks a {SAFETY_BORDER}px transparent safety border")
    bbox = visible_bbox(image, 2)
    return {
        "canvas": list(expected_size),
        "visible_bbox_alpha_2": list(bbox),
        "visible_pixels": int(np.count_nonzero(alpha)),
        "opaque_pixels": int(np.count_nonzero(alpha == 255)),
    }


def render_map_preview() -> None:
    manifest = json.loads((ROOT / "src/assets/asset-manifest.json").read_text(encoding="utf-8"))
    base_source = manifest["maps"]["garden_base"]["source"]
    canvas = Image.open(ROOT / "src/assets" / base_source).convert("RGBA")
    for facility_id, target in TARGETS.items():
        facility = manifest["map_facility_assets"][facility_id]
        sprite = Image.open(target["path"]).convert("RGBA")
        width = round(canvas.width * facility["geometry"]["width_ratio"])
        height = round(width * sprite.height / sprite.width)
        sprite = sprite.resize((width, height), Image.Resampling.LANCZOS)
        center_x, center_y = facility["geometry"]["render_center"]
        x = round(center_x * canvas.width - width / 2)
        y = round(center_y * canvas.height - height / 2)
        canvas.alpha_composite(sprite, (x, y))
    PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(PREVIEW, optimize=True)


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    report: dict[str, object] = {
        "version": "shared-facility-ruin.v1",
        "source": SOURCE.relative_to(ROOT).as_posix(),
        "source_sha256": sha256(SOURCE),
        "source_size": list(source.size),
        "source_crop_bbox_alpha_8": list(visible_bbox(source, ALPHA_CROP_THRESHOLD)),
        "outputs": {},
    }

    for facility_id, target in TARGETS.items():
        output = normalize(source, target["size"], target["content_bottom"])
        path: Path = target["path"]
        path.parent.mkdir(parents=True, exist_ok=True)
        output.save(path, optimize=True)
        details = validate(output, target["size"])
        details.update(
            {
                "path": path.relative_to(ROOT).as_posix(),
                "sha256": sha256(path),
                "content_bottom": target["content_bottom"],
            }
        )
        report["outputs"][facility_id] = details

    render_map_preview()
    report["map_preview"] = {
        "path": PREVIEW.relative_to(ROOT).as_posix(),
        "sha256": sha256(PREVIEW),
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
