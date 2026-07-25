#!/usr/bin/env python3
"""Generate obvious stand-in sprites for plants whose real art isn't in yet.

This exists so the *code* side of an art swap can land and be reviewed before
the art does: ids, requires, card names and layout all go in against
placeholders, and the real files drop into art/raw/ later with no code change.

A placeholder is deliberately hideous (magenta, striped, labelled) and carries
a `plantdoku:placeholder` PNG metadata key. `prep_sprites.py` preserves that
key and `--check` FAILS on it, so a build can never ship one by accident.

    python3 scripts/make_placeholders.py sunflower daisy cactus aloe
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont
from PIL.PngImagePlugin import PngInfo

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "..", "art", "raw")
SIZE = 512
MAGENTA = (255, 0, 200, 255)
PLACEHOLDER_KEY = "plantdoku:placeholder"


def make(name: str) -> str:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # A blobby "plant" shape so framing/padding still looks realistic in the
    # UI, but nobody could mistake it for finished art.
    d.ellipse((120, 60, 392, 300), fill=MAGENTA)
    d.polygon([(256, 300), (300, 460), (212, 460)], fill=MAGENTA)
    d.ellipse((150, 420, 362, 480), fill=(180, 0, 140, 255))
    for y in range(60, 480, 24):  # hazard stripes
        d.line((120, y, 392, y), fill=(0, 0, 0, 90), width=6)
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", 34)
    except OSError:
        font = ImageFont.load_default()
    label = f"{name}\nPLACEHOLDER"
    d.multiline_text((SIZE // 2, 170), label, fill=(255, 255, 255, 255),
                     font=font, anchor="mm", align="center", spacing=8)

    meta = PngInfo()
    meta.add_text(PLACEHOLDER_KEY, "1")
    os.makedirs(RAW, exist_ok=True)
    path = os.path.join(RAW, f"{name}.png")
    img.save(path, pnginfo=meta)
    return path


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("usage: make_placeholders.py <plant-id> [<plant-id>...]")
    for n in sys.argv[1:]:
        print("  placeholder ->", os.path.relpath(make(n), os.path.join(HERE, "..")))
