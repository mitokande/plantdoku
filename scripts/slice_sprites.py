#!/usr/bin/env python3
"""Slice the Plantdoku sprite sheet into 17 individual transparent PNGs.

The source sheet is 1254x1254 with plants on a dark navy background:
  rows 1-3 : 4 plants each
  row 4    : 5 (smaller) plants   -> 17 sprites total

Strategy:
  1. Flood-fill the navy background from the border to transparent. Flood fill
     (vs a global colour threshold) preserves dark pixels *inside* a plant.
  2. Label connected components of the foreground and keep the 17 large blobs
     (each plant + its little mound is one component). This extracts each plant
     by its real silhouette, so neighbouring sprites never bleed into a crop.
  3. Group the blobs into rows (4/4/4/5) and tight-crop each to a PNG.
"""
import os
import numpy as np
from scipy import ndimage
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get(
    "SHEET",
    "/root/.claude/uploads/fc984e60-4020-4bc5-9132-2c0c36db2183/09bf4d67-1000121562.png",
)
OUT = os.path.join(HERE, "..", "assets", "plants")

# Row-major names, must match src/game/plants.ts (4/4/4/5)
NAMES = [
    ["peashooter", "sunflower", "cactus", "chomper"],
    ["ice-crystal", "garlic", "leaf", "cherries"],
    ["bluebell", "yellow-mushroom", "purple-mushroom", "aloe"],
    ["flame", "lotus", "vine", "daisy", "purple-spike"],
]
ROW_SIZES = [len(r) for r in NAMES]

SENTINEL = (255, 0, 255)  # magenta marker for "this was background"
FLOOD_THRESH = 50         # colour distance tolerance for the flood fill
MIN_AREA = 1500           # px; smaller components are anti-alias specks
PAD = 8                   # transparent padding kept around each crop
ROW_GAP = 120             # min vertical gap between sprite rows


def clean_rgba(img: Image.Image):
    """Return (RGBA image with bg->alpha0, boolean foreground mask)."""
    rgb = img.convert("RGB")
    w, h = rgb.size
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1),
             (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]
    for s in seeds:
        ImageDraw.floodfill(rgb, s, SENTINEL, thresh=FLOOD_THRESH)
    arr = np.array(rgb)
    bg = (arr[:, :, 0] == 255) & (arr[:, :, 1] == 0) & (arr[:, :, 2] == 255)
    fg = ~bg

    rgba = np.array(img.convert("RGBA"))
    rgba[bg] = (0, 0, 0, 0)
    return Image.fromarray(rgba, "RGBA"), fg


def find_blobs(fg: np.ndarray):
    """Return big components as dicts sorted into rows then by x."""
    lbl, n = ndimage.label(fg, structure=np.ones((3, 3)))
    blobs = []
    objs = ndimage.find_objects(lbl)
    for i, sl in enumerate(objs, start=1):
        if sl is None:
            continue
        ys, xs = sl
        area = int((lbl[sl] == i).sum())
        if area < MIN_AREA:
            continue
        blobs.append({
            "area": area,
            "box": (xs.start, ys.start, xs.stop, ys.stop),
            "cx": (xs.start + xs.stop) / 2,
            "cy": (ys.start + ys.stop) / 2,
        })
    blobs.sort(key=lambda b: b["cy"])
    # split into rows on vertical gaps
    rows, cur, prev = [], [], None
    for b in blobs:
        if prev is not None and b["cy"] - prev > ROW_GAP:
            rows.append(cur); cur = []
        cur.append(b); prev = b["cy"]
    if cur:
        rows.append(cur)
    for r in rows:
        r.sort(key=lambda b: b["cx"])
    return rows


def main():
    os.makedirs(OUT, exist_ok=True)
    sheet = Image.open(SRC)
    print(f"sheet: {sheet.size[0]}x{sheet.size[1]}")
    rgba, fg = clean_rgba(sheet)
    rows = find_blobs(fg)

    got = [len(r) for r in rows]
    print(f"rows found: {got}  expected: {ROW_SIZES}")
    if got != ROW_SIZES:
        raise SystemExit(f"!! row layout mismatch: {got} != {ROW_SIZES} "
                         f"(adjust MIN_AREA / ROW_GAP / FLOOD_THRESH)")

    count = 0
    W, H = rgba.size
    for r, row in enumerate(rows):
        for c, b in enumerate(row):
            x0, y0, x1, y1 = b["box"]
            x0 = max(0, x0 - PAD); y0 = max(0, y0 - PAD)
            x1 = min(W, x1 + PAD); y1 = min(H, y1 + PAD)
            sprite = rgba.crop((x0, y0, x1, y1))
            name = NAMES[r][c]
            path = os.path.join(OUT, f"{name}.png")
            sprite.save(path)
            print(f"  {name:16s} {sprite.width:4d}x{sprite.height:4d} "
                  f"area={b['area']:6d} -> {os.path.relpath(path, HERE)}")
            count += 1
    print(f"done: {count} sprites")


if __name__ == "__main__":
    main()
