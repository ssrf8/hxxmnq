#!/usr/bin/env python3
"""Normalize extracted V3 facility sprites into project-ready shared canvases."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image


@dataclass(frozen=True)
class AssetSpec:
    group: str
    source_name: str
    target_relative: str


ASSETS = (
    AssetSpec("magic-greenhouse", "基础温室.png", "magic-greenhouse/magic-greenhouse-base-v3.png"),
    AssetSpec("magic-greenhouse", "自由生成温室.png", "magic-greenhouse/magic-greenhouse-free-growth-v3.png"),
    AssetSpec("magic-greenhouse", "人偶温室.png", "magic-greenhouse/magic-greenhouse-doll-maintained-v3.png"),
    AssetSpec("magic-greenhouse", "河童温室.png", "magic-greenhouse/magic-greenhouse-kappa-automated-v3.png"),
    AssetSpec("fairy-garden", "四季花园.png", "fairy-garden/fairy-garden-four-season-v3.png"),
    AssetSpec("fairy-garden", "妖精游乐园.png", "fairy-garden/fairy-garden-playground-v3.png"),
    AssetSpec("fairy-garden", "冰迷宫.png", "fairy-garden/fairy-garden-ice-dew-maze-v3.png"),
    AssetSpec("moon-spring", "露天月见汤.png", "moon-spring/moon-spring-open-air-v3.png"),
    AssetSpec("moon-spring", "静水观测池.png", "moon-spring/moon-spring-still-water-observation-v3.png"),
    AssetSpec("moon-spring", "雾隐汤屋.png", "moon-spring/moon-spring-mist-hidden-bathhouse-v3.png"),
    AssetSpec("banquet-plaza", "灯火夜市.png", "banquet-plaza/banquet-plaza-lantern-market-v3.png"),
    AssetSpec("banquet-plaza", "鬼之大宴台.png", "banquet-plaza/banquet-plaza-oni-grand-feast-v3.png"),
    AssetSpec("banquet-plaza", "符卡演武场.png", "banquet-plaza/banquet-plaza-spell-card-arena-v3.png"),
)


def parse_args() -> argparse.Namespace:
    project_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=project_root / "旧素材/素材处理/抠图结果",
        help="Directory containing the 13 transparent Chinese-named cutouts.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=project_root / "src/assets/world/map-facilities",
        help="Project map-facility asset root.",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=project_root / "project/v3-facility-asset-preparation-report.json",
        help="Deterministic preparation report.",
    )
    parser.add_argument("--padding", type=int, default=24)
    parser.add_argument("--alignment", type=int, default=16)
    return parser.parse_args()


def aligned(value: int, alignment: int) -> int:
    return int(math.ceil(value / alignment) * alignment)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def portable_path(path: Path, project_root: Path) -> str:
    try:
        return path.relative_to(project_root).as_posix()
    except ValueError:
        return str(path)


def alpha_bbox(rgba: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.nonzero(rgba[:, :, 3])
    if not len(xs):
        raise ValueError("Transparent source has no visible pixels")
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def main() -> None:
    args = parse_args()
    project_root = Path(__file__).resolve().parents[1]
    if args.padding < 16:
        raise ValueError("--padding must be at least 16")
    if args.alignment < 1:
        raise ValueError("--alignment must be positive")

    source_root = args.source.resolve()
    output_root = args.output.resolve()
    report_path = args.report.resolve()
    grouped: dict[str, list[tuple[AssetSpec, np.ndarray]]] = defaultdict(list)
    for spec in ASSETS:
        source_path = source_root / spec.source_name
        if not source_path.is_file():
            raise FileNotFoundError(source_path)
        with Image.open(source_path) as image:
            rgba = np.asarray(image.convert("RGBA")).copy()
        rgba[rgba[:, :, 3] == 0, :3] = 0
        grouped[spec.group].append((spec, rgba))

    report_assets: list[dict[str, object]] = []
    group_reports: dict[str, dict[str, object]] = {}
    for group, entries in grouped.items():
        shapes = {rgba.shape[:2] for _, rgba in entries}
        if len(shapes) != 1:
            raise ValueError(f"{group} source canvases differ: {sorted(shapes)}")

        boxes = [alpha_bbox(rgba) for _, rgba in entries]
        union = (
            min(box[0] for box in boxes),
            min(box[1] for box in boxes),
            max(box[2] for box in boxes),
            max(box[3] for box in boxes),
        )
        content_width = union[2] - union[0]
        content_height = union[3] - union[1]
        target_width = aligned(content_width + args.padding * 2, args.alignment)
        target_height = aligned(content_height + args.padding * 2, args.alignment)
        paste_x = (target_width - content_width) // 2
        paste_y = (target_height - content_height) // 2

        group_reports[group] = {
            "source_canvas": [int(shapes.copy().pop()[1]), int(shapes.copy().pop()[0])],
            "source_union_bbox": list(union),
            "target_canvas": [target_width, target_height],
            "minimum_transparent_padding": args.padding,
        }

        for spec, rgba in entries:
            content = rgba[union[1] : union[3], union[0] : union[2]]
            normalized = np.zeros((target_height, target_width, 4), dtype=np.uint8)
            normalized[
                paste_y : paste_y + content_height,
                paste_x : paste_x + content_width,
            ] = content
            normalized[normalized[:, :, 3] == 0, :3] = 0

            destination = output_root / spec.target_relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            Image.fromarray(normalized, "RGBA").save(
                destination,
                format="PNG",
                optimize=True,
                compress_level=9,
            )

            visible_box = alpha_bbox(normalized)
            edge_padding = {
                "left": visible_box[0],
                "top": visible_box[1],
                "right": target_width - visible_box[2],
                "bottom": target_height - visible_box[3],
            }
            if min(edge_padding.values()) < args.padding:
                raise ValueError(
                    f"{destination} transparent padding below {args.padding}: {edge_padding}"
                )
            report_assets.append(
                {
                    "group": group,
                    "source": spec.source_name,
                    "target": portable_path(destination, project_root),
                    "canvas": [target_width, target_height],
                    "alpha_bbox": list(visible_box),
                    "transparent_padding": edge_padding,
                    "bytes": destination.stat().st_size,
                    "sha256": sha256(destination),
                }
            )

    report = {
        "ok": True,
        "method": "shared alpha-union crop, 24px minimum transparent padding, 16px canvas alignment",
        "source_directory": portable_path(source_root, project_root),
        "output_directory": portable_path(output_root, project_root),
        "asset_count": len(report_assets),
        "groups": group_reports,
        "assets": report_assets,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Prepared {len(report_assets)} V3 facility assets.")
    print(f"Output: {output_root}")
    print(f"Report: {report_path}")


if __name__ == "__main__":
    main()
