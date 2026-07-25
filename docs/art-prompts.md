# Plantdoku — image-generation prompts (copy-paste ready)

Every image still missing before release, with the exact prompt to paste into
an image generator and the folder to drop the result into.

**Generator rules that apply to all of these**

- Generate at **1024×1024 or larger**, square. The pipeline downsamples; it
  never upsamples.
- **Plain flat background** (flat white or flat mid-grey). No gradient, no
  shadow cast onto the backdrop — the cut-out step needs a clean fill.
- **No text, no letters, no words** in any generation. Text is what produced
  the current "PLANTDÓKU" typo in the icon; the wordmark gets composited in
  code, not generated.
- **No faces, no eyes, no expressions.** This is the rule that keeps the set
  clear of the franchise the old art copied.
- Never name a game, franchise, studio, or living artist in a prompt. Use a
  tool whose terms grant commercial rights to outputs, and save the terms into
  `docs/licenses/`.

**The shared style prefix** — paste this in front of *every* subject clause
below so all the new art matches the 13 existing sprites:

```
casual mobile game plant icon, painterly vector art, smooth cel shading with
soft gradients, subtle dark green outline, single light source from the top
left, three-quarter front view, centered single subject, saturated but earthy
garden colours, small soil mound base with a soft contact shadow, no text, no
face, no eyes, no character expression, plain flat background
```

---

## Part 1 — the 4 missing plant sprites

**Upload to:** `art/raw/` — filename must be exactly `<id>.png`.

These four are `PLACEHOLDER` stand-ins today and are the only reason
`npm run sprites:check` fails. Ids, card names and flavour text are already
wired, so no code change is needed once the files land.

### 1. `sunflower.png`

```
<style prefix> + a single tall sunflower with a large round golden-yellow
bloom, dark brown seed centre with no face, two broad green leaves on the stem
```

Dominant hue must be **golden yellow**.

### 2. `daisy.png`

```
<style prefix> + a small daisy with white rounded petals and a yellow centre,
slim green stem, two narrow leaves
```

Dominant hue must be **white** (yellow eye only).

### 3. `cactus.png`

```
<style prefix> + a stout ribbed barrel cactus with even spines and a small
red-pink flower on top, sitting in dry soil
```

Dominant hue must be **green with a pink accent**.

### 4. `aloe.png`

```
<style prefix> + an aloe vera rosette of thick pointed blue-green leaves with
pale speckles and soft serrated edges
```

Dominant hue must be **blue-green** (distinct from the fern's green).

**Accept / reject test for all four**

- No face — regenerate rather than paint one out.
- Silhouette test: fill it flat black and view at 40px. It must still read as
  that plant and must not be confusable with `sprout`, `clover`, `fern`,
  `tulip` or `toadstool`.
- No detail thinner than ~8px at 512 — it vanishes at board size.
- Roughly the visual weight of the existing 13; exact framing doesn't matter,
  `--fit area` normalises it.

Then:

```bash
python3 scripts/prep_sprites.py --in art/raw --fit area   # rebuild all 17
npm run sprites:check                                     # must exit 0
```

---

## Part 2 — app icon and splash

**Upload to:** `art/raw-icons/` (create the folder; it doesn't exist yet).

`assets/icon.png`, `assets/splash-icon.png`, `assets/android-icon-foreground.png`,
`assets/android-icon-monochrome.png` and `assets/favicon.png` are all still
built from the copied Sunflower and Cherries, so all of them have to be
replaced. You only need to **generate two images** — the rest are derived from
them mechanically (see Part 3).

### 5. `icon-art.png` — the app icon

The icon has to read at **48px** in a launcher and as a small thumbnail in
store search. That means few elements, high contrast, no fine detail. Board
motif + plants, no text.

```
mobile game app icon artwork, top-down three-quarter view of a small square
garden puzzle board with four large rounded stone tiles in a chunky carved
wooden frame, the four tiles tinted sage green, terracotta clay, sand and
dusty rose, one simple plant growing from each tile — a green sprout, a red
tulip, a red-capped toadstool with cream spots, and a purple lavender spike —
painterly vector art, smooth cel shading with soft gradients, subtle dark
outline, single light source from the top left, bold simple shapes readable at
small size, deep forest green background, no text, no letters, no face, no
eyes, centered composition with generous margin
```

Accept / reject:

- Squint at 48px: you should still see "four coloured tiles in a wooden
  frame". If it reads as mush, ask for fewer/larger tiles.
- **Nothing important in the outer ~12%** — Android crops the adaptive icon to
  a circle and iOS rounds the corners.
- No text anywhere. The `PLANTDOKU` wordmark is composited later, and only
  onto the feature graphic and store screenshots — not the icon.
- Background can be generated deep green (`#13251A`); it gets replaced with
  the flat brand colour for the Android layers anyway.

### 6. `splash-art.png` — the splash emblem

Renders at only 200pt wide, centred on `#13251A`, so it must be a **single
bold emblem**, not a scene. Simpler than the icon, not busier.

```
mobile game splash emblem, a single lush green sprout with two broad seed
leaves growing from a small soil mound, enclosed in a thick circular carved
wooden ring, soft warm glow behind the leaves, painterly vector art, smooth cel
shading, subtle dark outline, single light source from the top left, bold
simple shapes, symmetrical centered composition, deep forest green background,
no text, no letters, no face, no eyes
```

Accept / reject:

- Must survive being shrunk to 200pt — one shape, one glow, nothing thin.
- The area outside the wooden ring must be either flat `#13251A` or flat
  background colour so it can be cut to transparent cleanly.
- No text.

---

## Part 3 — derived, do NOT generate

Once 5 and 6 are in `art/raw-icons/`, these come out of them mechanically —
generating them separately would produce mismatched art:

| file | derived how |
|---|---|
| `assets/icon.png` | icon-art, squared to 1024², flattened onto `#13251A` (iOS forbids alpha) |
| `assets/android-icon-foreground.png` | icon-art on transparent, scaled to ~66% so the circular mask doesn't clip it |
| `assets/android-icon-background.png` | already a flat `#1B2202` fill — keep it |
| `assets/android-icon-monochrome.png` | flat-white silhouette of the foreground on transparent (themed-icon spec — a colour version is wrong here) |
| `assets/favicon.png` | icon.png downscaled to 196² |
| `assets/splash-icon.png` | splash-art cut out to transparent, 1024² |

Ask me to wire this up after you upload — it's one pass over the two source
files, and I'll re-run `npm run typecheck` / the export bundle to confirm every
asset path still resolves.

---

## Checklist

- [x] `art/raw/sunflower.png`
- [x] `art/raw/daisy.png`
- [x] `art/raw/cactus.png`
- [x] `art/raw/aloe.png`
- [ ] `art/raw-icons/icon-art.png`
- [ ] `art/raw-icons/splash-art.png`
- [ ] Generator's output-rights terms saved to `docs/licenses/`
