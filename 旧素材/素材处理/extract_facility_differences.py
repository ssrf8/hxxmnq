#!/usr/bin/env python3
"""Extract the named V3 facility from each full-map difference image.

The input images are not chroma-key renders.  Each one is a lightly redrawn copy
of the V3 garden map containing four facilities, while its filename identifies
the one facility that should be retained.  This script therefore:

1. crops the known facility quadrant;
2. compares it with the empty V3 base map;
3. uses the strong difference pixels as GrabCut foreground seeds;
4. removes unseeded background components;
5. gives every variant in the same facility group one shared padded canvas.

Original source images are never modified.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont


@dataclass(frozen=True)
class FacilitySpec:
    group: str
    roi: tuple[int, int, int, int]


GREENHOUSE_EXPANDED_ROI = (0, 35, 560, 525)
GREENHOUSE_OLD_ROI_IN_EXPANDED = (45, 55, 520, 435)
GREENHOUSE_EXPANDED_SAFETY_POLYGON = (
    (10, 150),
    (60, 80),
    (140, 15),
    (390, 5),
    (510, 60),
    (559, 130),
    (559, 390),
    (520, 470),
    (60, 480),
    (10, 420),
)


SPECS: dict[str, FacilitySpec] = {
    "基础温室.png": FacilitySpec("magic-greenhouse", GREENHOUSE_EXPANDED_ROI),
    "自由生成温室.png": FacilitySpec("magic-greenhouse", GREENHOUSE_EXPANDED_ROI),
    "人偶温室.png": FacilitySpec("magic-greenhouse", GREENHOUSE_EXPANDED_ROI),
    "河童温室.png": FacilitySpec("magic-greenhouse", GREENHOUSE_EXPANDED_ROI),
    "四季花园.png": FacilitySpec("fairy-garden", (1080, 65, 1635, 510)),
    "妖精游乐园.png": FacilitySpec("fairy-garden", (1080, 65, 1635, 510)),
    "冰迷宫.png": FacilitySpec("fairy-garden", (1080, 65, 1635, 510)),
    "露天月见汤.png": FacilitySpec("moon-spring", (35, 435, 625, 880)),
    "静水观测池.png": FacilitySpec("moon-spring", (35, 435, 625, 880)),
    "雾隐汤屋.png": FacilitySpec("moon-spring", (35, 435, 625, 880)),
    "灯火夜市.png": FacilitySpec("banquet-plaza", (895, 450, 1590, 920)),
    "鬼之大宴台.png": FacilitySpec("banquet-plaza", (895, 450, 1590, 920)),
    "符卡演武场.png": FacilitySpec("banquet-plaza", (895, 450, 1590, 920)),
}

# ROI-local safety silhouettes.  These deliberately leave room for entrances,
# eaves, lantern strings, foliage, and contact shadows while excluding the
# distant cherry trees and paths that the generator also redrew.
SAFETY_POLYGONS: dict[str, tuple[tuple[int, int], ...]] = {
    "magic-greenhouse": (
        (8, 130),
        (55, 70),
        (125, 25),
        (345, 10),
        (445, 65),
        (474, 150),
        (474, 315),
        (430, 370),
        (60, 378),
        (10, 330),
    ),
    "fairy-garden": (
        (5, 145),
        (60, 80),
        (155, 35),
        (395, 30),
        (490, 75),
        (535, 165),
        (535, 345),
        (495, 420),
        (400, 444),
        (105, 444),
        (20, 385),
        (0, 285),
    ),
    "moon-spring": (
        (0, 170),
        (50, 105),
        (125, 45),
        (220, 35),
        (300, 80),
        (405, 70),
        (525, 115),
        (588, 205),
        (588, 330),
        (525, 405),
        (405, 443),
        (120, 443),
        (25, 390),
        (0, 300),
    ),
    "banquet-plaza": (
        (5, 190),
        (60, 125),
        (150, 85),
        (215, 55),
        (500, 55),
        (590, 105),
        (645, 180),
        (645, 350),
        (595, 425),
        (500, 468),
        (125, 468),
        (25, 405),
        (0, 305),
    ),
}

# These two greenhouse variants contain several small, fully enclosed regions
# whose colors happen to remain close to the empty base map. GrabCut therefore
# labels them as background even though the surrounding facility silhouette is
# continuous. Limit the repair to the affected source files so intentional
# openings in other facilities remain untouched.
ENCLOSED_HOLE_REPAIR_LIMITS: dict[str, int] = {
    "人偶温室.png": 320,
    "河童温室.png": 160,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract the filename-matched facility from V3 full-map differences."
    )
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=Path.cwd(),
        help="Directory containing the 13 named PNG source images.",
    )
    parser.add_argument(
        "--base",
        type=Path,
        default=None,
        help="Empty V3 garden base image; auto-detected when omitted.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path.cwd() / "抠图结果",
        help="Destination for transparent PNGs, preview, and report.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Replace files previously generated in the output directory.",
    )
    return parser.parse_args()


def auto_base(input_dir: Path) -> Path:
    for parent in (input_dir, *input_dir.parents):
        candidate = parent / "src/assets/maps/garden-base-owner-v3.png"
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(
        "Could not locate src/assets/maps/garden-base-owner-v3.png; pass --base."
    )


def seeded_components(mask: np.ndarray, seed: np.ndarray) -> np.ndarray:
    """Keep components supported by strong differences, dropping terrain noise."""
    count, labels, stats, _ = cv2.connectedComponentsWithStats(
        mask.astype(np.uint8), connectivity=8
    )
    result = np.zeros_like(mask, dtype=np.uint8)
    for label in range(1, count):
        component = labels == label
        area = int(stats[label, cv2.CC_STAT_AREA])
        seed_count = int((component & seed).sum())
        if seed_count >= 12 and (area >= 80 or seed_count / max(area, 1) >= 0.60):
            result[component] = 1
    return result


def retain_main_cluster(mask: np.ndarray) -> np.ndarray:
    """Retain the main facility plus small pieces immediately beside it."""
    count, labels, stats, _ = cv2.connectedComponentsWithStats(
        mask.astype(np.uint8), connectivity=8
    )
    if count <= 1:
        return mask
    largest_label = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    result = (labels == largest_label).astype(np.uint8)
    near_main = cv2.dilate(
        result,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17)),
        iterations=1,
    ).astype(bool)
    for label in range(1, count):
        if label == largest_label:
            continue
        component = labels == label
        area = int(stats[label, cv2.CC_STAT_AREA])
        if area >= 12 and np.any(component & near_main):
            result[component] = 1
    return result


def repair_small_enclosed_holes(mask: np.ndarray, maximum_area: int) -> np.ndarray:
    """Fill only small background components that cannot reach the ROI rim."""
    background = (mask == 0).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(
        background, connectivity=8
    )
    border_labels = set(
        int(label)
        for label in np.unique(
            np.concatenate(
                (
                    labels[0, :],
                    labels[-1, :],
                    labels[:, 0],
                    labels[:, -1],
                )
            )
        )
    )
    repaired = mask.copy()
    for label in range(1, count):
        if label in border_labels:
            continue
        area = int(stats[label, cv2.CC_STAT_AREA])
        if area <= maximum_area:
            repaired[labels == label] = 1
    return repaired


def extract_binary_mask(
    source: np.ndarray,
    base: np.ndarray,
    safety_polygon: tuple[tuple[int, int], ...],
) -> tuple[np.ndarray, np.ndarray]:
    difference = np.max(
        np.abs(source.astype(np.int16) - base.astype(np.int16)), axis=2
    ).astype(np.uint8)

    # GrabCut labels: 0 BG, 1 FG, 2 probable BG, 3 probable FG.
    grab_mask = np.full(difference.shape, cv2.GC_PR_BGD, dtype=np.uint8)
    grab_mask[difference >= 32] = cv2.GC_PR_FGD
    grab_mask[difference >= 86] = cv2.GC_FGD
    grab_mask[difference <= 10] = cv2.GC_BGD

    # The ROI contains safety padding; its outer rim is guaranteed background.
    rim = 5
    grab_mask[:rim, :] = cv2.GC_BGD
    grab_mask[-rim:, :] = cv2.GC_BGD
    grab_mask[:, :rim] = cv2.GC_BGD
    grab_mask[:, -rim:] = cv2.GC_BGD

    background_model = np.zeros((1, 65), np.float64)
    foreground_model = np.zeros((1, 65), np.float64)
    cv2.grabCut(
        cv2.cvtColor(source, cv2.COLOR_RGB2BGR),
        grab_mask,
        None,
        background_model,
        foreground_model,
        7,
        cv2.GC_INIT_WITH_MASK,
    )

    binary = np.isin(grab_mask, (cv2.GC_FGD, cv2.GC_PR_FGD)).astype(np.uint8)
    strong_seed = difference >= 72
    binary = seeded_components(binary, strong_seed)

    # Close pinholes without turning the detailed silhouette into a solid blob.
    close_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, close_kernel, iterations=1)

    polygon_mask = np.zeros(binary.shape, dtype=np.uint8)
    cv2.fillPoly(
        polygon_mask,
        [np.asarray(safety_polygon, dtype=np.int32)],
        color=1,
    )
    binary &= polygon_mask
    binary = retain_main_cluster(binary)
    return binary, difference


def greenhouse_recovery_region(
    shape: tuple[int, int], source_name: str
) -> np.ndarray:
    """Return owner-annotated recovery zones on the expanded greenhouse ROI."""
    recovery = np.zeros(shape, dtype=np.uint8)
    if source_name == "人偶温室.png":
        cv2.ellipse(recovery, (285, 62), (100, 27), 0, 0, 360, 1, -1)
        cv2.ellipse(recovery, (520, 265), (32, 115), 0, 0, 360, 1, -1)
        cv2.ellipse(recovery, (195, 438), (60, 27), 0, 0, 360, 1, -1)
    elif source_name == "河童温室.png":
        cv2.ellipse(recovery, (284, 47), (124, 45), 0, 0, 360, 1, -1)
        cv2.ellipse(recovery, (43, 280), (34, 78), 0, 0, 360, 1, -1)
        cv2.fillPoly(
            recovery,
            [
                np.asarray(
                    [(505, 108), (559, 150), (559, 365), (500, 382), (490, 250)],
                    dtype=np.int32,
                )
            ],
            color=1,
        )
        cv2.ellipse(recovery, (268, 441), (116, 31), 0, 0, 360, 1, -1)
    return recovery


def binary_to_alpha(binary: np.ndarray) -> np.ndarray:
    """Create the project-standard one-pixel soft edge."""
    blurred = cv2.GaussianBlur(binary.astype(np.float32), (0, 0), 0.65)
    alpha = np.clip(np.rint(blurred * 255.0), 0, 255).astype(np.uint8)
    interior = cv2.erode(binary, np.ones((3, 3), np.uint8), iterations=1) > 0
    alpha[interior] = 255
    alpha[alpha < 8] = 0
    return alpha


def extract_mask(
    source: np.ndarray, base: np.ndarray, group: str, source_name: str
) -> tuple[np.ndarray, np.ndarray]:
    if group == "magic-greenhouse":
        x0, y0, x1, y1 = GREENHOUSE_OLD_ROI_IN_EXPANDED
        old_binary, _ = extract_binary_mask(
            source[y0:y1, x0:x1],
            base[y0:y1, x0:x1],
            SAFETY_POLYGONS[group],
        )
        binary = np.zeros(source.shape[:2], dtype=np.uint8)
        binary[y0:y1, x0:x1] = old_binary

        recovery = greenhouse_recovery_region(binary.shape, source_name)
        if np.any(recovery):
            expanded_binary, difference = extract_binary_mask(
                source,
                base,
                GREENHOUSE_EXPANDED_SAFETY_POLYGON,
            )
            binary |= expanded_binary & recovery
        else:
            difference = np.max(
                np.abs(source.astype(np.int16) - base.astype(np.int16)), axis=2
            ).astype(np.uint8)
    else:
        binary, difference = extract_binary_mask(
            source,
            base,
            SAFETY_POLYGONS[group],
        )

    repair_limit = ENCLOSED_HOLE_REPAIR_LIMITS.get(source_name)
    if repair_limit is not None:
        binary = repair_small_enclosed_holes(binary, repair_limit)

    alpha = binary_to_alpha(binary)
    if repair_limit is not None:
        repaired_alpha_mask = repair_small_enclosed_holes(
            (alpha > 0).astype(np.uint8), repair_limit
        )
        alpha[(alpha == 0) & (repaired_alpha_mask > 0)] = 255
    return alpha, difference


def shared_group_boxes(
    records: list[dict[str, object]], padding: int = 16
) -> dict[str, tuple[int, int, int, int]]:
    boxes: dict[str, list[int]] = {}
    for record in records:
        alpha = record["alpha"]
        assert isinstance(alpha, np.ndarray)
        ys, xs = np.nonzero(alpha)
        if not len(xs):
            raise ValueError(f"No foreground detected for {record['name']}")
        current = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
        group = str(record["group"])
        if group not in boxes:
            boxes[group] = current
        else:
            boxes[group] = [
                min(boxes[group][0], current[0]),
                min(boxes[group][1], current[1]),
                max(boxes[group][2], current[2]),
                max(boxes[group][3], current[3]),
            ]

    result: dict[str, tuple[int, int, int, int]] = {}
    for group, box in boxes.items():
        sample = next(record for record in records if record["group"] == group)
        alpha = sample["alpha"]
        assert isinstance(alpha, np.ndarray)
        height, width = alpha.shape
        result[group] = (
            max(0, box[0] - padding),
            max(0, box[1] - padding),
            min(width, box[2] + padding),
            min(height, box[3] + padding),
        )
    return result


def checkerboard(size: tuple[int, int], tile: int = 12) -> Image.Image:
    width, height = size
    yy, xx = np.indices((height, width))
    pattern = ((xx // tile + yy // tile) % 2).astype(np.uint8)
    light = np.array([225, 225, 225, 255], dtype=np.uint8)
    dark = np.array([175, 175, 175, 255], dtype=np.uint8)
    return Image.fromarray(np.where(pattern[:, :, None] == 0, light, dark), "RGBA")


def make_preview(output_dir: Path, names: list[str]) -> Path:
    cell_width, cell_height = 280, 245
    columns = 3
    rows = (len(names) + columns - 1) // columns
    sheet = Image.new("RGBA", (columns * cell_width, rows * cell_height), "#202020")
    draw = ImageDraw.Draw(sheet)
    font_path = Path("C:/Windows/Fonts/msyh.ttc")
    font = (
        ImageFont.truetype(str(font_path), 16)
        if font_path.is_file()
        else ImageFont.load_default()
    )
    for index, name in enumerate(names):
        row, column = divmod(index, columns)
        x, y = column * cell_width, row * cell_height
        with Image.open(output_dir / name) as source:
            image = source.convert("RGBA")
        image.thumbnail((260, 205), Image.Resampling.LANCZOS)
        board = checkerboard((260, 205))
        board.alpha_composite(image, ((260 - image.width) // 2, 205 - image.height))
        sheet.alpha_composite(board, (x + 10, y + 8))
        draw.text((x + 10, y + 218), name, fill="white", font=font)
    destination = output_dir / "透明抠图总览.png"
    sheet.convert("RGB").save(destination, format="PNG")
    return destination


def main() -> None:
    args = parse_args()
    input_dir = args.input_dir.resolve()
    output_dir = args.output_dir.resolve()
    base_path = (args.base.resolve() if args.base else auto_base(input_dir))

    missing = [name for name in SPECS if not (input_dir / name).is_file()]
    if missing:
        raise FileNotFoundError(f"Missing source images: {', '.join(missing)}")

    generated = [output_dir / name for name in SPECS]
    generated += [output_dir / "透明抠图总览.png", output_dir / "抠图报告.json"]
    existing = [path for path in generated if path.exists()]
    if existing and not args.force:
        raise FileExistsError(
            f"{existing[0]} already exists; rerun with --force to replace generated files."
        )

    with Image.open(base_path) as image:
        base_full = np.asarray(image.convert("RGB"))
    records: list[dict[str, object]] = []
    for name, spec in SPECS.items():
        with Image.open(input_dir / name) as image:
            source_full = np.asarray(image.convert("RGB"))
        if source_full.shape != base_full.shape:
            raise ValueError(
                f"{name} has shape {source_full.shape}, expected {base_full.shape}."
            )
        x0, y0, x1, y1 = spec.roi
        source = source_full[y0:y1, x0:x1].copy()
        base = base_full[y0:y1, x0:x1]
        alpha, difference = extract_mask(source, base, spec.group, name)
        records.append(
            {
                "name": name,
                "group": spec.group,
                "roi": spec.roi,
                "source": source,
                "alpha": alpha,
                "difference": difference,
            }
        )

    boxes = shared_group_boxes(records)
    output_dir.mkdir(parents=True, exist_ok=True)
    report_items: list[dict[str, object]] = []
    for record in records:
        name = str(record["name"])
        group = str(record["group"])
        source = record["source"]
        alpha = record["alpha"]
        assert isinstance(source, np.ndarray)
        assert isinstance(alpha, np.ndarray)
        x0, y0, x1, y1 = boxes[group]
        rgb_crop = source[y0:y1, x0:x1].copy()
        alpha_crop = alpha[y0:y1, x0:x1]
        rgb_crop[alpha_crop == 0] = 0
        output = Image.fromarray(np.dstack([rgb_crop, alpha_crop]), "RGBA")
        destination = output_dir / name
        output.save(destination, format="PNG")

        visible = alpha_crop > 0
        report_items.append(
            {
                "source": name,
                "group": group,
                "source_roi": list(record["roi"]),
                "shared_crop_in_roi": [x0, y0, x1, y1],
                "output_size": list(output.size),
                "visible_pixels": int(visible.sum()),
                "partial_alpha_pixels": int(
                    ((alpha_crop > 0) & (alpha_crop < 255)).sum()
                ),
                "opaque_pixels": int((alpha_crop == 255).sum()),
                "transparent_corners": all(
                    output.getpixel(point)[3] == 0
                    for point in (
                        (0, 0),
                        (output.width - 1, 0),
                        (0, output.height - 1),
                        (output.width - 1, output.height - 1),
                    )
                ),
            }
        )

    preview_path = make_preview(output_dir, list(SPECS))
    report = {
        "ok": True,
        "method": "V3 base-map difference seeds + GrabCut + seeded component cleanup",
        "input_directory": str(input_dir),
        "base_image": str(base_path),
        "output_directory": str(output_dir),
        "source_files_preserved": True,
        "file_count": len(report_items),
        "shared_canvas_per_facility_group": True,
        "preview": preview_path.name,
        "files": report_items,
    }
    report_path = output_dir / "抠图报告.json"
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Extracted {len(report_items)} facilities.")
    print(f"Output: {output_dir}")
    print(f"Preview: {preview_path}")
    print(f"Report: {report_path}")


if __name__ == "__main__":
    main()
