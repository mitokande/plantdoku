#!/usr/bin/env python3
"""Generate the missing Plantdoku art with Gemini ("Nano Banana") image models.

One script, stdlib only (urllib + json + base64) — no SDK, no new dependency.
It holds the prompts from docs/art-prompts.md so the style prefix, the accept
rules and the filenames can't drift from the brief, calls the Gemini image
model once per target, and drops the PNGs straight into the folders the sprite
pipeline already reads.

    art/raw/<plant-id>.png     ->  python3 scripts/prep_sprites.py --in art/raw --fit area
    art/raw-icons/<name>.png   ->  icon / splash sources (derived by hand, see the brief)

Usage
-----
    export GEMINI_API_KEY=...          # or put it in .env / pass --key
    python3 scripts/gen_art.py --list             # targets
    python3 scripts/gen_art.py --models           # model ids this key can call
    python3 scripts/gen_art.py missing            # the 4 PLACEHOLDER plants
    python3 scripts/gen_art.py sunflower -n 4     # 4 variants to pick from
    python3 scripts/gen_art.py icons
    python3 scripts/gen_art.py all --force
    python3 scripts/gen_art.py missing --dry-run  # print prompts, call nothing

Targets are ids (`sunflower`, `icon`, ...) or the groups `missing`, `plants`,
`icons`, `all`. With -n 1 the file lands as `<id>.png`; with -n > 1 you get
`<id>-1.png … <id>-N.png` to review, and you rename the keeper to `<id>.png`
(prep_sprites.py only ever reads exact `<plant-id>.png`).

Nothing here touches assets/ — generation stops at the raw art, and the
existing pipeline does the normalising, so a bad batch is one `rm` away.
"""
import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
RAW = os.path.join(ROOT, "art", "raw")
RAW_ICONS = os.path.join(ROOT, "art", "raw-icons")

API = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
LIST_API = "https://generativelanguage.googleapis.com/v1beta/models"
# "Nano Banana" = Gemini's image model. Flash is the cheap workhorse; pass
# --model gemini-3-pro-image-preview for the higher-fidelity (pricier) one.
# Run `--models` once your key is set to confirm the exact id your key serves.
DEFAULT_MODEL = "gemini-3.1-flash-image"

# --- Prompts (docs/art-prompts.md is the source of truth for this copy) ------

# Pasted in front of every plant subject so new art matches the shipped sprites.
STYLE = (
    "casual mobile game plant icon, painterly vector art, smooth cel shading "
    "with soft gradients, subtle dark green outline, single light source from "
    "the top left, three-quarter front view, centered single subject, "
    "saturated but earthy garden colours, small soil mound base with a soft "
    "contact shadow, no text, no face, no eyes, no character expression, "
    "plain flat background"
)

# id -> subject clause. The four PLACEHOLDER ids carry the brief's full
# wording; the other thirteen are here so a regeneration of the whole set stays
# on-concept (see the table in docs/art-brief.md).
PLANTS = {
    # the four that make `npm run sprites:check` fail today
    "sunflower": (
        "a single tall sunflower with a large round golden-yellow bloom, dark "
        "brown seed centre with no face, two broad green leaves on the stem, "
        "dominant hue golden yellow"
    ),
    "daisy": (
        "a small daisy with white rounded petals and a yellow centre, slim "
        "green stem, two narrow leaves, dominant hue white"
    ),
    "cactus": (
        "a stout ribbed barrel cactus with even spines and a small red-pink "
        "flower on top, sitting in dry soil, dominant hue green with a pink "
        "accent"
    ),
    "aloe": (
        "an aloe vera rosette of thick pointed blue-green leaves with pale "
        "speckles and soft serrated edges, dominant hue blue-green"
    ),
    # already shipped — only regenerate deliberately
    "sprout": "two rounded seed-leaves on a small soil mound, fresh green, the simplest starter plant",
    "clover": "a low wide clump of rounded trefoil clover leaves, deep green",
    "tulip": "a single red cup-shaped tulip bloom on a straight stem with two long leaves",
    "fern": "a fern with arching fronds of fine leaflets, mid green",
    "toadstool": "a toadstool with a red domed cap, cream spots and a pale thick stem",
    "lavender": "purple lavender flower spikes rising from grey-green grassy foliage",
    "monstera": "one big split monstera leaf growing from a terracotta pot",
    "waterlily": "a pink waterlily bloom resting on a round green lily pad with a soft water ripple",
    "bonsai": "a small bonsai tree with a gnarled trunk and layered green canopy in a shallow tray",
    "pitcher": "a carnivorous pitcher plant, a green jug with a lid and red-tipped rim",
    "frostbloom": (
        "a magical ice-crystal lotus flower, cyan and pale blue translucent "
        "petals with a faint inner glow and frost on the base"
    ),
    "emberbud": (
        "a magical flame-petal bloom, orange-red petals shaped like fire with "
        "small ember sparks rising and a charred soil base"
    ),
    "nightspire": (
        "a magical violet spire of crystalline leaves tapering upward, deep "
        "purple with a dark shadowed base and a faint arcane shimmer"
    ),
}

# Ids whose art in art/raw is still a stand-in — the default target set.
MISSING = ["sunflower", "daisy", "cactus", "aloe"]

# Icon / splash sources. Self-contained prompts (different style rules: these
# are scenes/emblems, not board sprites) and a different output folder.
ICONS = {
    "icon-art": (
        "mobile game app icon artwork, top-down three-quarter view of a small "
        "square garden puzzle board with four large rounded stone tiles in a "
        "chunky carved wooden frame, the four tiles tinted sage green, "
        "terracotta clay, sand and dusty rose, one simple plant growing from "
        "each tile — a green sprout, a red tulip, a red-capped toadstool with "
        "cream spots, and a purple lavender spike — painterly vector art, "
        "smooth cel shading with soft gradients, subtle dark outline, single "
        "light source from the top left, bold simple shapes readable at small "
        "size, deep forest green background, no text, no letters, no face, no "
        "eyes, centered composition with generous margin"
    ),
    "splash-art": (
        "mobile game splash emblem, a single lush green sprout with two broad "
        "seed leaves growing from a small soil mound, enclosed in a thick "
        "circular carved wooden ring, soft warm glow behind the leaves, "
        "painterly vector art, smooth cel shading, subtle dark outline, single "
        "light source from the top left, bold simple shapes, symmetrical "
        "centered composition, deep forest green background, no text, no "
        "letters, no face, no eyes"
    ),
}


def prompt_for(target: str) -> str:
    if target in ICONS:
        return ICONS[target]
    return f"{STYLE}, {PLANTS[target]}"


def out_dir_for(target: str) -> str:
    return RAW_ICONS if target in ICONS else RAW


# --- Target resolution -------------------------------------------------------

def palette_ids() -> list[str]:
    """Plant ids straight from palette.ts, so this script can't drift from code."""
    src = open(os.path.join(ROOT, "src", "game", "palette.ts"), encoding="utf-8").read()
    block = src.split("PLANT_IDS: string[] = [")[1].split("];")[0]
    return re.findall(r'"([a-z0-9\-]+)"', block)


def resolve(names: list[str]) -> list[str]:
    ids = palette_ids()
    unknown = [p for p in ids if p not in PLANTS]
    if unknown:
        sys.exit(f"palette.ts has ids with no prompt here: {', '.join(unknown)}")

    groups = {
        "missing": MISSING,
        "plants": ids,
        "icons": list(ICONS),
        "all": ids + list(ICONS),
    }
    out: list[str] = []
    for name in names:
        picked = groups.get(name, [name] if name in PLANTS or name in ICONS else None)
        if picked is None:
            sys.exit(f"unknown target {name!r} — try --list")
        for t in picked:
            if t not in out:
                out.append(t)
    return out


# --- API key -----------------------------------------------------------------

def api_key(cli_key: str | None) -> str:
    if cli_key:
        return cli_key
    for var in ("GEMINI_API_KEY", "GOOGLE_API_KEY"):
        if os.environ.get(var):
            return os.environ[var]
    env = os.path.join(ROOT, ".env")  # same file Expo reads; keep it untracked
    if os.path.exists(env):
        for line in open(env, encoding="utf-8"):
            m = re.match(r"\s*(?:export\s+)?(GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*(.+)", line)
            if m:
                return m.group(2).strip().strip("'\"")
    sys.exit(
        "No API key. Set GEMINI_API_KEY in your shell or .env, or pass --key.\n"
        "Get one at https://aistudio.google.com/apikey"
    )


# --- Generation --------------------------------------------------------------

def list_models(key: str, timeout: int) -> None:
    """Print the image-capable models this key can actually call."""
    req = urllib.request.Request(LIST_API + "?pageSize=200", headers={"x-goog-api-key": key})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as e:
        raise SystemExit(f"list failed — HTTP {e.code}: {e.read().decode(errors='replace')[:400]}")
    names = [
        m["name"].removeprefix("models/")
        for m in data.get("models", [])
        if "generateContent" in m.get("supportedGenerationMethods", [])
    ]
    image = [n for n in names if "image" in n]
    print("image models:\n  " + "\n  ".join(image or ["(none — check the full list below)"]))
    if not image:
        print("all:\n  " + "\n  ".join(names))
    print(f"\ndefault in this script: {DEFAULT_MODEL}")


def generate(prompt: str, key: str, model: str, timeout: int, retries: int) -> tuple[bytes, str]:
    """One image. Returns (bytes, mime). Retries transient errors with backoff."""
    body = json.dumps(
        {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseModalities": ["IMAGE"],
                "imageConfig": {"aspectRatio": "1:1"},
            },
        }
    ).encode()

    last = ""
    for attempt in range(retries + 1):
        req = urllib.request.Request(
            API.format(model=model),
            data=body,
            headers={"Content-Type": "application/json", "x-goog-api-key": key},
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.load(resp)
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")[:400]
            last = f"HTTP {e.code}: {detail}"
            if e.code in (408, 429, 500, 502, 503, 504) and attempt < retries:
                wait = 2 ** attempt * 5
                print(f"    {last.splitlines()[0]} — retrying in {wait}s", file=sys.stderr)
                time.sleep(wait)
                continue
            raise SystemExit(f"    request failed — {last}")
        except (urllib.error.URLError, TimeoutError) as e:
            last = str(e)
            if attempt < retries:
                time.sleep(2 ** attempt * 5)
                continue
            raise SystemExit(f"    network error — {last}")

        for cand in data.get("candidates", []):
            for part in cand.get("content", {}).get("parts", []):
                inline = part.get("inlineData") or part.get("inline_data")
                if inline and inline.get("data"):
                    return base64.b64decode(inline["data"]), inline.get("mimeType", "image/png")
            if cand.get("finishReason") in ("SAFETY", "PROHIBITED_CONTENT", "IMAGE_SAFETY"):
                raise SystemExit(f"    blocked by the model ({cand['finishReason']}) — reword the prompt")
        raise SystemExit(f"    no image in response: {json.dumps(data)[:400]}")
    raise SystemExit(f"    gave up — {last}")


def save(path: str, blob: bytes, mime: str) -> str:
    """Write the image as PNG. Converts if the model handed back JPEG."""
    if mime != "image/png":
        try:
            import io

            from PIL import Image  # already a dep of the sprite scripts

            Image.open(io.BytesIO(blob)).convert("RGBA").save(path, "PNG")
            return path
        except ImportError:
            path = os.path.splitext(path)[0] + ".jpg"
            print(f"    ! {mime} and no Pillow — saved as {os.path.basename(path)}", file=sys.stderr)
    with open(path, "wb") as fh:
        fh.write(blob)
    return path


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("targets", nargs="*", default=["missing"],
                    help="ids or groups: missing (default) | plants | icons | all")
    ap.add_argument("-n", "--variants", type=int, default=1, help="images per target (default 1)")
    ap.add_argument("--model", default=DEFAULT_MODEL, help=f"default {DEFAULT_MODEL}")
    ap.add_argument("--key", help="Gemini API key (else GEMINI_API_KEY / .env)")
    ap.add_argument("--out", help="override the output directory")
    ap.add_argument("--force", action="store_true", help="overwrite existing files")
    ap.add_argument("--dry-run", action="store_true", help="print prompts, call nothing")
    ap.add_argument("--list", action="store_true", help="list every target and exit")
    ap.add_argument("--models", action="store_true", help="ask the API which image models your key can call")
    ap.add_argument("--timeout", type=int, default=180)
    ap.add_argument("--retries", type=int, default=2)
    args = ap.parse_args()

    if args.list:
        print("plants: " + ", ".join(palette_ids()))
        print("icons:  " + ", ".join(ICONS))
        print("groups: missing (" + ", ".join(MISSING) + "), plants, icons, all")
        return

    if args.models:
        list_models(api_key(args.key), args.timeout)
        return

    targets = resolve(args.targets or ["missing"])
    key = "DRY-RUN" if args.dry_run else api_key(args.key)

    written: list[str] = []
    for target in targets:
        prompt = prompt_for(target)
        out_dir = args.out or out_dir_for(target)
        os.makedirs(out_dir, exist_ok=True)
        print(f"\n{target}  ->  {os.path.relpath(out_dir, ROOT)}/")
        if args.dry_run:
            print(f"    {prompt}")
            continue

        for i in range(1, args.variants + 1):
            name = f"{target}.png" if args.variants == 1 else f"{target}-{i}.png"
            path = os.path.join(out_dir, name)
            if os.path.exists(path) and not args.force:
                print(f"    skip {name} (exists — pass --force)")
                continue
            blob, mime = generate(prompt, key, args.model, args.timeout, args.retries)
            written.append(os.path.relpath(save(path, blob, mime), ROOT))
            print(f"    wrote {name}  ({len(blob) // 1024} KB)")

    if not written:
        return
    print("\nGenerated:")
    for p in written:
        print(f"  {p}")
    print(
        "\nReview against docs/art-prompts.md (no face, silhouette reads at 40px,\n"
        "nothing thinner than ~8px), rename the keeper to <id>.png if you used -n,\n"
        "then:\n"
        "  python3 scripts/prep_sprites.py --in art/raw --fit area\n"
        "  npm run sprites:check"
    )


if __name__ == "__main__":
    main()
