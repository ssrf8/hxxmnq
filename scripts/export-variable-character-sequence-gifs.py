import json
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError as error:
    raise SystemExit("Pillow is required to export acceptance GIFs") from error


ROOT = Path.cwd()
CHARACTER_ROOT = ROOT / "src" / "assets" / "characters"
CHARACTERS = ("alice", "cirno", "mystia", "nitori", "reimu", "sakuya", "suika")
SPEEDS = (90,)
PREVIEW_CELL = 160


def checkerboard(size):
    image = Image.new("RGB", (size, size), (44, 46, 52))
    draw = ImageDraw.Draw(image)
    tile = 16
    for y in range(0, size, tile):
        for x in range(0, size, tile):
            if (x // tile + y // tile) % 2:
                draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill=(62, 65, 72))
    return image


def preview_frame(character_root, frame_number):
    canvas = Image.new("RGB", (PREVIEW_CELL * 2, PREVIEW_CELL * 2), (44, 46, 52))
    directions = ("front", "back", "left", "right")
    for index, direction in enumerate(directions):
        source = character_root / "sequence-v1" / "frames" / direction / f"{frame_number:03}.png"
        with Image.open(source) as image:
            sprite = image.convert("RGBA").resize(
                (PREVIEW_CELL, PREVIEW_CELL),
                Image.Resampling.NEAREST,
            )
        cell = checkerboard(PREVIEW_CELL)
        cell.paste(sprite.convert("RGB"), mask=sprite.getchannel("A"))
        canvas.paste(cell, ((index % 2) * PREVIEW_CELL, (index // 2) * PREVIEW_CELL))
    return canvas


def export_character(character):
    character_root = CHARACTER_ROOT / character
    manifest_file = character_root / "sequence-v1" / "manifest.json"
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    frames = [preview_frame(character_root, index) for index in range(1, manifest["frameCount"] + 1)]
    output_root = character_root / "sequence-v1" / "previews"
    output_root.mkdir(parents=True, exist_ok=True)
    for stale in output_root.glob("*.gif"):
        stale.unlink()
    for duration in SPEEDS:
        output = output_root / f"{character}-animation-sequence-v1-{duration}ms-overview.gif"
        frames[0].save(
            output,
            save_all=True,
            append_images=frames[1:],
            duration=duration,
            loop=0,
            disposal=2,
            optimize=False,
        )
        print(output.relative_to(ROOT).as_posix())


def main():
    selected = tuple(sys.argv[1:]) or CHARACTERS
    unknown = sorted(set(selected) - set(CHARACTERS))
    if unknown:
        raise SystemExit(f"unknown characters: {', '.join(unknown)}")
    for character in selected:
        export_character(character)


if __name__ == "__main__":
    main()
