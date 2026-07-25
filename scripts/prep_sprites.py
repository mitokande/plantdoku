#!/usr/bin/env python3
"""Normalise raw plant art into production sprites (and audit what shipped).

Any source — a commissioned set, a licensed pack, an AI batch, exports from a
vector tool — arrives with different canvas sizes, crops and padding. The board
draws every plant into the same square box, so inconsistent padding reads as
"some plants are bigger than others". This script makes one uniform set:

    trim to the real silhouette -> scale to a fixed content box
    -> centre on a 512x512 transparent canvas -> optimise

Usage
-----
    python3 scripts/prep_sprites.py --in art/raw            # build sprites
    python3 scripts/prep_sprites.py --in art/raw --fit area # equal visual mass
    python3 scripts/prep_sprites.py --check                 # audit assets/plants

`--in` takes a directory of `<plant-id>.png` files (ids come from
src/game/palette.ts, so the two can never drift). Sources that arrive on a flat
backdrop instead of transparency — an AI batch, a photo, a flattened export —
are cut out automatically (per file, so a mixed directory is fine); `--bg
always|never` forces the decision and `--bg-tol` tunes the fill.

`--check` runs no writes: it verifies every id in PLANT_IDS has a sprite that
meets the spec below and exits non-zero if not, so it can gate a release build.
"""
import argparse
import os
import re
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter
from PIL.PngImagePlugin import PngInfo

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
PALETTE = os.path.join(ROOT, "src", "game", "palette.ts")
OUT = os.path.join(ROOT, "assets", "plants")

# --- Production spec ---------------------------------------------------------
# CANVAS: the biggest on-screen use is the card-inspect modal at 120pt, so 512
# covers a 3x device (360px) with headroom for future layouts.
# PAD_FRAC: transparent margin on the long edge, so nothing touches the box.
# ALPHA_FLOOR: alpha below this is anti-alias haze, not silhouette.
CANVAS = 512
PAD_FRAC = 0.06
ALPHA_FLOOR = 8
MIN_CANVAS = 384  # --check: anything smaller will soften on a 3x screen
MAX_KB = 220  # --check: warn (not fail) above this; 17 sprites ship in the app
# Stand-in art from scripts/make_placeholders.py. The marker is carried through
# the pipeline and hard-fails --check, so placeholders can never ship.
PLACEHOLDER_KEY = "plantdoku:placeholder"


def plant_ids() -> list[str]:
    """The 17 ids the app actually renders, read straight from palette.ts."""
    src = open(PALETTE, encoding="utf-8").read()
    block = src.split("PLANT_IDS: string[] = [")[1].split("];")[0]
    return re.findall(r'"([a-z0-9\-]+)"', block)


def is_opaque(img: Image.Image) -> bool:
    """True if the source has no usable alpha (a generated/flat-backdrop image)."""
    alpha = img.convert("RGBA").getchannel("A")
    clear = alpha.histogram()[: ALPHA_FLOOR + 1]
    return sum(clear) < 0.01 * img.width * img.height


def cutout(img: Image.Image, mode: str, tol: int) -> Image.Image:
    """RGBA image with the background transparent.

    `mode` is auto | always | never. **auto** (the default) decides per file, so
    a directory can mix already-cut sprites with fresh AI/photo art on a flat
    backdrop — flooding an image that is already cut out would eat the dark
    parts of the plant, since RGBA->RGB turns its transparent pixels black.

    The fill is seeded from *every* border pixel, not the four corners: a plant
    that runs off one edge splits the backdrop into regions a corner seed can't
    reach. `tol` is summed across RGB, so ~90 also swallows the soft contact
    shadow these generators paint onto the backdrop while leaving pale petals
    (which sit hundreds away) alone. Dark pixels *inside* the plant survive
    because the fill is connectivity-based, not a global threshold.
    """
    img = img.convert("RGBA")
    if mode == "never" or (mode == "auto" and not is_opaque(img)):
        return img

    rgb = img.convert("RGB")
    w, h = rgb.size
    sentinel = (255, 0, 255)
    px = rgb.load()
    border = [(x, y) for x in range(w) for y in (0, h - 1)]
    border += [(x, y) for y in range(h) for x in (0, w - 1)]
    for seed in border:
        if px[seed] != sentinel:
            ImageDraw.floodfill(rgb, seed, sentinel, thresh=tol)

    mask = Image.new("L", (w, h), 255)  # 255 = keep
    mp = mask.load()
    for y in range(h):
        for x in range(w):
            if px[x, y] == sentinel:
                mp[x, y] = 0
    # The flood stops one pixel short of the silhouette, leaving an anti-aliased
    # rim of backdrop colour that reads as a pale halo on the board. Erode the
    # kept area by 1px to drop it, then blur a hair for a soft edge.
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))

    out = img.copy()
    out.putalpha(ImageChops.multiply(out.getchannel("A"), mask))
    return out


def silhouette_box(img: Image.Image):
    """Bounding box of pixels above the alpha floor (ignores AA haze)."""
    alpha = img.getchannel("A").point(lambda v: 255 if v > ALPHA_FLOOR else 0)
    return alpha.getbbox()


def normalise(img: Image.Image, fit: str, target_mass: float | None) -> Image.Image:
    """Trim, scale to the content box and centre on a square canvas."""
    box = silhouette_box(img)
    if box is None:
        raise ValueError("image is fully transparent")
    art = img.crop(box)
    content = CANVAS * (1 - 2 * PAD_FRAC)

    if fit == "area" and target_mass:
        # Equal visual *mass* rather than equal bounding box: a spindly plant
        # (a vine) gets scaled up next to a solid one (a mushroom) instead of
        # reading as the same size but half as present.
        mass = sum(1 for v in art.getchannel("A").getdata() if v > ALPHA_FLOOR)
        scale = (target_mass / mass) ** 0.5 if mass else 1.0
        w, h = int(art.width * scale), int(art.height * scale)
        # Never let the box overflow the canvas, whatever the mass says.
        cap = content / max(w, h)
        if cap < 1:
            w, h = int(w * cap), int(h * cap)
    else:
        scale = content / max(art.width, art.height)
        w, h = int(art.width * scale), int(art.height * scale)

    art = art.resize((max(1, w), max(1, h)), Image.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(art, ((CANVAS - art.width) // 2, (CANVAS - art.height) // 2), art)
    return canvas


def build(src_dir: str, fit: str, bg_mode: str, tol: int) -> int:
    ids = plant_ids()
    missing = [i for i in ids if not os.path.exists(os.path.join(src_dir, f"{i}.png"))]
    if missing:
        print(f"!! {len(missing)} of {len(ids)} ids have no source art in {src_dir}:")
        for i in missing:
            print(f"     {i}.png")
        print("   (add them, or rename PLANT_IDS in src/game/palette.ts to match)")
        return 1

    loaded = {}
    cut = []
    for i in ids:
        src = Image.open(os.path.join(src_dir, f"{i}.png"))
        before = is_opaque(src)
        loaded[i] = cutout(src, bg_mode, tol)
        if before and bg_mode != "never":
            cut.append(i)
    if cut:
        print(f"cut out {len(cut)} opaque source(s): {', '.join(cut)}")

    target_mass = None
    if fit == "area":
        masses = []
        for img in loaded.values():
            art = img.crop(silhouette_box(img))
            scale = (CANVAS * (1 - 2 * PAD_FRAC)) / max(art.width, art.height)
            masses.append(
                sum(1 for v in art.getchannel("A").getdata() if v > ALPHA_FLOOR)
                * scale**2
            )
        masses.sort()
        target_mass = masses[len(masses) // 2]  # median plant sets the norm

    os.makedirs(OUT, exist_ok=True)
    placeholders = []
    for i in ids:
        source = Image.open(os.path.join(src_dir, f"{i}.png"))
        sprite = normalise(loaded[i], fit, target_mass)
        meta = None
        if source.info.get(PLACEHOLDER_KEY):  # carry the marker through
            meta = PngInfo()
            meta.add_text(PLACEHOLDER_KEY, "1")
            placeholders.append(i)
        path = os.path.join(OUT, f"{i}.png")
        sprite.save(path, optimize=True, pnginfo=meta)
        flag = "  <- PLACEHOLDER" if meta else ""
        print(f"  {i:18s} -> {CANVAS}x{CANVAS}  {os.path.getsize(path) // 1024:4d}KB{flag}")
    print(f"done: {len(ids)} sprites in {os.path.relpath(OUT, ROOT)}")
    if placeholders:
        print(f"\n{len(placeholders)} placeholder(s) still in the set: "
              f"{', '.join(placeholders)}")
        print("  drop the real art in art/raw/ and re-run; --check fails until then")
    return 0


def check() -> int:
    """Audit the shipped sprites against the spec. Non-zero exit = not ready."""
    ids = plant_ids()
    errors, warnings = [], []
    print(f"{'id':18s} {'KB':>5s} {'canvas':>11s} {'fill%':>6s} {'pad%':>6s}")
    for i in ids:
        path = os.path.join(OUT, f"{i}.png")
        if not os.path.exists(path):
            errors.append(f"{i}: no sprite at assets/plants/{i}.png")
            print(f"{i:18s}  MISSING")
            continue
        raw = Image.open(path)
        if raw.info.get(PLACEHOLDER_KEY):
            errors.append(f"{i}: still a PLACEHOLDER — real art has not landed")
        img = raw.convert("RGBA")
        kb = os.path.getsize(path) // 1024
        box = silhouette_box(img)
        if box is None:
            errors.append(f"{i}: fully transparent")
            continue
        bw, bh = box[2] - box[0], box[3] - box[1]
        fill = 100 * (bw * bh) / (img.width * img.height)
        pad = 100 * (1 - max(bw, bh) / max(img.width, img.height))
        print(f"{i:18s} {kb:4d}K {img.width:5d}x{img.height:<5d} {fill:5.1f}% {pad:5.1f}%")

        if img.width != img.height:
            errors.append(f"{i}: canvas {img.width}x{img.height} is not square")
        if min(img.width, img.height) < MIN_CANVAS:
            errors.append(f"{i}: {img.width}px canvas is under the {MIN_CANVAS}px floor")
        if pad < 1:
            warnings.append(f"{i}: art touches the canvas edge (pad {pad:.1f}%)")
        if kb > MAX_KB:
            warnings.append(f"{i}: {kb}KB is heavy for a sprite")

    sizes = {Image.open(os.path.join(OUT, f"{i}.png")).size for i in ids
             if os.path.exists(os.path.join(OUT, f"{i}.png"))}
    if len(sizes) > 1:
        errors.append(f"canvases are not uniform: {sorted(sizes)}")

    for w in warnings:
        print(f"warn: {w}")
    for e in errors:
        print(f"FAIL: {e}")
    print("\nsprites OK" if not errors else f"\n{len(errors)} problem(s)")
    return 1 if errors else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--in", dest="src", help="directory of <plant-id>.png source art")
    ap.add_argument("--fit", choices=["max", "area"], default="max",
                    help="'max' matches bounding boxes, 'area' matches visual mass")
    ap.add_argument("--bg", choices=["auto", "always", "never"], default="auto",
                    help="flood-fill a flat background away: 'auto' (default) "
                         "only for sources that have no alpha")
    ap.add_argument("--bg-tol", type=int, default=90,
                    help="background fill tolerance, summed over RGB (default 90)")
    ap.add_argument("--check", action="store_true",
                    help="audit assets/plants against the spec and exit")
    args = ap.parse_args()

    if args.check:
        return check()
    if not args.src:
        ap.error("pass --in <dir> to build, or --check to audit")
    return build(args.src, args.fit, args.bg, args.bg_tol)


if __name__ == "__main__":
    sys.exit(main())
