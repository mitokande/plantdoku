#!/usr/bin/env python3
"""AI-generate the 17 Plantdoku plant sprites as game-ready transparent PNGs.

Two stages, both runnable independently:

  1. GENERATE  — call an image model (default OpenAI `gpt-image-1`, which emits
                 transparent-background PNGs) once per plant, using a shared
                 style prefix + a per-plant subject so all 17 share the chunky,
                 glossy "Plants-vs-Zombies" cartoon look of the originals.
                 Raw output -> scripts/plant_raw/<id>.png  (NOT under assets/,
                 so Metro never bundles the raws).
  2. PROCESS   — clean each raw with Pillow: drop any opaque background, trim to
                 the visible silhouette, pad, downscale, and write the final
                 assets/plants/<id>.png with a clean alpha channel (the app
                 renders that alpha as a tinted watermark, so it must be tight).

Usage:
    export OPENAI_API_KEY=sk-...            # only needed for the generate stage
    python3 scripts/gen_plants.py           # generate all 17 + process
    python3 scripts/gen_plants.py --only sprout,cactus
    python3 scripts/gen_plants.py --process-only   # no key: clean existing raws
    python3 scripts/gen_plants.py --generate-only  # skip the Pillow cleanup

No third-party HTTP/SDK deps: the API call uses the stdlib (urllib). The
process stage uses Pillow (already a project tool, see slice_sprites.py).
"""
import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.request

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "plant_raw")
OUT = os.path.join(HERE, "..", "assets", "plants")

# Shared art direction — chunky glossy cartoon *rendering* (matches the game's
# look) but a cozy real-botanical subject set, no faces. Each plant sits on a
# small base with a soft drop shadow; the legendaries carry the magic.
STYLE = (
    "Chunky glossy cartoon plant illustration, cozy mobile-game art style. "
    "Thick rounded forms, bold clean readable silhouette, smooth cel-shading "
    "with soft gradients and glossy highlights, vibrant but slightly muted "
    "botanical colours. No face, no eyes. The whole plant is centered and "
    "fully in frame, sitting on a small base with a soft drop shadow. "
    "Single object only, front view, no text, no border, no extra props, "
    "fully transparent background."
)

# id -> subject. Ids/order must match PLANT_IDS in src/game/palette.ts and the
# require()s in src/game/plants.ts. Chosen for 17 distinct silhouettes; tweak a
# subject freely to restyle a plant. Cozy botanical -> magical (legendaries).
PROMPTS = {
    # commons — humble, instantly readable garden plants
    "sprout": "a tiny seedling: two small round leaves on a short stem, just "
              "breaking out of a small mound of dark soil",
    "clover": "a green clover: a cluster of three rounded heart-shaped leaves "
              "on slim stems, on a small grassy tuft",
    "sunflower": "a tall sunflower: one big round bloom with a brown seed "
                 "centre and bright yellow petals on a leafy green stem, on a "
                 "small soil mound",
    "tulip": "a single closed tulip: a smooth cup-shaped red bloom on a tall "
             "green stem with two long leaves, on a small soil mound",
    "fern": "a fern: a fan of feathery arching green fronds, on a small soil "
            "mound",
    "cactus": "a barrel cactus with two stubby arms and yellow spines, topped "
              "with a single red flower, standing in a ring of small rocks",
    "aloe": "an aloe vera plant: a rosette of thick pointed green succulent "
            "leaves, on a small soil mound",
    "cherries": "a pair of glossy red cherries joined by green stems with one "
                "leaf, on a small soil mound",
    "toadstool": "a single plump toadstool with a rounded spotted red cap and "
                 "a chubby pale stalk, on a small soil mound",
    # rares — showier / exotic real plants
    "monstera": "a monstera leaf: one big glossy split green leaf with natural "
                "holes on an upright stem, in a small pot of soil",
    "lavender": "a lavender plant: several tall slender stems topped with "
                "spikes of small purple blossoms, with thin grey-green leaves, "
                "on a small soil mound",
    "waterlily": "a pink water lily: layered petals resting on a round green "
                 "lily pad floating on calm water",
    "pitcher": "a tropical pitcher plant: a tall green-and-red tubular pitcher "
               "with a lid, on a leafy stem, on a small soil mound",
    "bonsai": "a small bonsai tree: a gnarled trunk with a rounded canopy of "
              "green foliage, in a shallow rectangular pot",
    # legendaries — magical elemental blooms
    "frostbloom": "a magical ice flower: a glowing pale-blue crystalline bloom "
                  "with frosty translucent petals and a soft cold glow, on a "
                  "small frosted mound",
    "emberbud": "a magical fire flower: a glowing bloom of orange and red "
                "petals wreathed in a small soft flame, with glowing embers, "
                "on a small scorched mound",
    "nightspire": "a magical moonlit flower: a tall spire of luminous violet "
                  "petals with a soft glow and tiny floating sparkles, on a "
                  "small dark mound",
}

# --- process-stage tuning ---
FLOOD_THRESH = 40      # bg-removal flood tolerance (only used if raw is opaque)
SENTINEL = (255, 0, 255)
PAD = 24               # transparent border kept around the trimmed sprite (px)
MAX_SIDE = 512         # downscale so the longest side is at most this


# Image model. gpt-image-1 emits transparent PNGs directly; dall-e-3/2 don't
# (their solid background is stripped in the process stage). Override with
# OPENAI_IMAGE_MODEL=dall-e-3 if your account lacks gpt-image-1 access.
MODEL = os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-1")
API_URL = "https://api.openai.com/v1/images/generations"


def _payload(full_prompt: str, size: str) -> dict:
    """Per-model request body — params differ between gpt-image-1 and dall-e-*."""
    if MODEL == "gpt-image-1":
        # gpt-image-1 always returns b64_json; response_format is NOT accepted.
        return {"model": MODEL, "prompt": full_prompt, "size": size,
                "n": 1, "background": "transparent"}
    body = {"model": MODEL, "prompt": full_prompt, "size": size,
            "n": 1, "response_format": "b64_json"}
    if MODEL == "dall-e-3":
        body["quality"] = "standard"
    return body


def gen_one(plant_id: str, prompt: str, size: str = "1024x1024") -> None:
    """Call the image API and save a raw PNG to scripts/plant_raw/."""
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise SystemExit(
            "OPENAI_API_KEY is not set. Either export it, or generate the "
            "images elsewhere, drop them in scripts/plant_raw/<id>.png, and "
            "run with --process-only."
        )
    body = json.dumps(_payload(f"{STYLE}\n\nSubject: {prompt}.", size)).encode()
    req = urllib.request.Request(
        API_URL,
        data=body,
        headers={"Authorization": f"Bearer {key}",
                 "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as e:
        # urllib swallows the body by default — it holds the real reason.
        detail = e.read().decode("utf-8", "replace")
        raise SystemExit(
            f"\nOpenAI API error {e.code} on '{plant_id}' (model={MODEL}):\n"
            f"{detail}\n"
            f"If this is a model-access or param error, try a different model:\n"
            f"  OPENAI_IMAGE_MODEL=dall-e-3 python3 scripts/gen_plants.py"
        )
    b64 = data["data"][0]["b64_json"]
    os.makedirs(RAW, exist_ok=True)
    path = os.path.join(RAW, f"{plant_id}.png")
    with open(path, "wb") as f:
        f.write(base64.b64decode(b64))
    print(f"  generated {plant_id:16s} -> {os.path.relpath(path, HERE)}")


def strip_opaque_bg(img: Image.Image) -> Image.Image:
    """If the raw came back with a solid background, flood-fill it to alpha.

    gpt-image-1 honours background=transparent, so this is just a safety net for
    images produced by other tools. Flood-fill from the corners (vs a global
    colour key) preserves matching colours *inside* the plant.
    """
    if img.mode == "RGBA":
        a = img.split()[3]
        if a.getextrema()[0] < 255:   # already has transparency -> leave it
            return img
    rgb = img.convert("RGB")
    w, h = rgb.size
    for s in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(rgb, s, SENTINEL, thresh=FLOOD_THRESH)
    px = rgb.load()
    out = img.convert("RGBA")
    op = out.load()
    for y in range(h):
        for x in range(w):
            if px[x, y] == SENTINEL:
                op[x, y] = (0, 0, 0, 0)
    return out


def process_one(plant_id: str) -> None:
    """Clean one raw -> final assets/plants/<id>.png (trimmed, padded, scaled)."""
    raw_path = os.path.join(RAW, f"{plant_id}.png")
    if not os.path.exists(raw_path):
        print(f"  !! no raw for {plant_id} ({os.path.relpath(raw_path, HERE)})")
        return
    img = strip_opaque_bg(Image.open(raw_path).convert("RGBA"))

    bbox = img.split()[3].getbbox()      # tight box of the visible silhouette
    if bbox:
        img = img.crop(bbox)
    img = img.crop((-PAD, -PAD, img.width + PAD, img.height + PAD))  # pad w/ alpha

    if max(img.size) > MAX_SIDE:
        scale = MAX_SIDE / max(img.size)
        img = img.resize((round(img.width * scale), round(img.height * scale)),
                         Image.LANCZOS)

    os.makedirs(OUT, exist_ok=True)
    out_path = os.path.join(OUT, f"{plant_id}.png")
    img.save(out_path)
    print(f"  processed {plant_id:16s} {img.width:3d}x{img.height:3d} "
          f"-> {os.path.relpath(out_path, HERE)}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--only", help="comma-separated plant ids (default: all 17)")
    ap.add_argument("--generate-only", action="store_true")
    ap.add_argument("--process-only", action="store_true")
    args = ap.parse_args()

    ids = [s.strip() for s in args.only.split(",")] if args.only else list(PROMPTS)
    unknown = [i for i in ids if i not in PROMPTS]
    if unknown:
        raise SystemExit(f"unknown plant id(s): {unknown}\nvalid: {list(PROMPTS)}")

    if not args.process_only:
        print(f"generating {len(ids)} sprite(s)...")
        for i in ids:
            gen_one(i, PROMPTS[i])
    if not args.generate_only:
        print(f"processing {len(ids)} sprite(s)...")
        for i in ids:
            process_one(i)
    print("done")


if __name__ == "__main__":
    main()
