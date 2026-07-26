# Plantdoku — plant sprite brief (production set)

Everything an artist, an asset pack, or an image model needs to produce the
17 plant sprites the game ships with. Written to be handed over as-is.

---

## Status

**The plant set has been rebuilt** — 13 real sprites + **4 placeholders**
(`sunflower`, `daisy`, `cactus`, `aloe`) that must be replaced before release.
See the appendix for how to generate them. `npm run sprites:check` fails until
they land. **The app icon and splash have been replaced** with the owner's own
logo (`art/logo.png` → `python3 scripts/build_icons.py`).

## Why the set was remade

**1. The old sprites couldn't ship.** `assets/plants/` held art copied from
**Plants vs. Zombies** (EA/PopCap): the Peashooter, the smiling Sunflower, the
Chomper, the angry Cherry Bomb, the Garlic — recognisable character designs,
several under their trademarked names, which were also the ids in
`src/game/palette.ts` and the card names in `src/game/cards.ts`. This is a
copyright and trademark exposure, not a style note: it risks takedown and
developer-account termination on both stores, and no store-listing wording
works around it. **`assets/icon.png`, `assets/splash-icon.png`,
`assets/android-icon-*.png` and `assets/favicon.png` are built from the same
Sunflower and Cherries and still need rebuilding from the new set.**

**2. They were also under-resolution.** The biggest on-screen use is the
card-inspect modal at 120pt — 360px on a 3x device. The old sprites were
205–325px on their long edge, so they softened exactly where the art is meant
to be the reward. Canvases were all different sizes and paddings, which is why
some plants read bigger than others on the board.

---

## Technical spec

| | |
|---|---|
| Format | PNG-32, RGBA, straight (non-premultiplied) alpha |
| Canvas | **512 × 512**, square, one size for every sprite |
| Padding | ~6% transparent margin on the long edge (nothing touches the edge) |
| Framing | Plant centred, sized so all 17 read as the same visual weight |
| Background | Fully transparent — **no baked background, no baked drop shadow on the canvas edge** |
| Weight | ≤ ~200 KB each (17 sprites ship inside the app bundle) |
| Naming | `<plant-id>.png`, ids exactly as listed below |
| Delivery | One folder of 17 PNGs, or one sprite sheet + the layout |

Hand the raw art to `scripts/prep_sprites.py --in <dir>` and it does the
trimming, scaling, centring and optimisation. `--fit area` matches *visual
mass* instead of bounding boxes — use it when the set mixes solid shapes
(mushroom) with spindly ones (a spike or vine), or they'll look mismatched even
at identical box sizes. `--bg` flood-fills a solid background away if the
source isn't cut out. `--check` audits the result and fails a build if the set
drifts out of spec.

## Style spec

The reference is the **existing 13-sprite set already in the repo** (`bonsai`,
`clover`, `emberbud`, `fern`, `frostbloom`, `lavender`, `monstera`,
`nightspire`, `pitcher`, `sprout`, `toadstool`, `tulip`, `waterlily`) — a
coherent, original-looking direction that predates the PvZ batch. Match it:

- **Painterly vector**: clean shapes, soft internal shading, a subtle darker
  outline. Not pixel art, not flat-minimal, not photoreal.
- **Single light source, top-left**, consistent across all 17.
- **Saturated but earthy** greens/browns; each plant gets one dominant hue.
- **Grounded**: most plants sit on a small soil mound / lily pad / base, with a
  soft contact shadow *inside* the canvas.
- **Three-quarter front view**, symmetrical-ish, no perspective tricks.
- **No faces, no eyes, no character expressions.** This is the single rule that
  keeps the set clear of the franchise the current art copies — and it fits the
  game better: these are garden plants, not characters.

**Readability rules** (the board is the real test — a plant renders at ~38pt
over a coloured tile, and a tinted silhouette of it is embossed into every
unsolved cell of its cluster):

- Each plant must be identifiable **by silhouette alone at 40px**. Test by
  filling it with flat black and squinting; if two are confusable, redesign one.
- Distinct dominant colours across the set — the cluster tint sits *behind* the
  plant, so a plant that matches its tile disappears.
- No thin detail under ~8px at 512 (it vanishes at board size).
- Colour is never the only signal (colour-blind players read the shapes).

## The 17 plants

Ids are lowercase-kebab and must match `PLANT_IDS` in `src/game/palette.ts`;
card names and rarity live in `src/game/cards.ts`. Rarity is 9 / 5 / 3 — the
legendaries should visibly out-class the commons (glow, crystal, embers).

| # | id | card name | rarity | concept |
|---|---|---|---|---|
| 1 | `sprout` | Sprout | common | two seed-leaves on a soil mound — the starter |
| 2 | `sunflower` | Sunflower | common | tall yellow bloom, dark seed centre, **no face** |
| 3 | `daisy` | Daisy | common | white petals, yellow eye, slim stem |
| 4 | `clover` | Clover | common | rounded trefoil leaves, low and wide |
| 5 | `tulip` | Tulip | common | red cup bloom, two long leaves |
| 6 | `cactus` | Cactus | common | ribbed barrel/column, spines, tiny flower on top |
| 7 | `aloe` | Aloe | common | blue-green rosette of thick pointed leaves |
| 8 | `fern` | Fern | common | arching fronds, fine leaflets |
| 9 | `toadstool` | Toadstool | common | red cap, cream spots, pale stem |
| 10 | `lavender` | Lavender | rare | purple flower spikes over grey-green grass |
| 11 | `monstera` | Monstera | rare | one big split leaf in a terracotta pot |
| 12 | `waterlily` | Waterlily | rare | pink bloom on a lily pad, water ripple |
| 13 | `bonsai` | Bonsai | rare | gnarled trunk, layered canopy, shallow tray |
| 14 | `pitcher` | Pitcher | rare | carnivorous jug with a lid, red-tipped |
| 15 | `frostbloom` | Frostbloom | legendary | ice-crystal lotus, cyan, faint inner glow |
| 16 | `emberbud` | Emberbud | legendary | flame-petal bloom, orange-red, ember sparks |
| 17 | `nightspire` | Nightspire | legendary | violet spire of crystalline leaves, dark base |

13 of these already exist as art in `assets/plants/` at ~512px on the long edge
and only need normalising. **Four are missing and must be produced:**
`sunflower`, `daisy`, `cactus`, `aloe` — all four are generic garden plants
with no franchise association, provided they're drawn faceless in the style
above.

## Appendix — generating the 4 missing plants

The other 13 are already in `art/raw/` as the source of record. These four are
`PLACEHOLDER` stand-ins until real files replace them. Generate at **1024×1024
or larger** (the pipeline downsamples to 512; upsampling never looks right),
on a **plain background** — flat white or flat mid-grey, no gradient, no
shadow cast onto the backdrop — then hand them over as
`art/raw/<id>.png`.

Shared style prefix — put this in front of every prompt so the four match the
existing set:

> casual mobile game plant icon, painterly vector art, smooth cel shading with
> soft gradients, subtle dark green outline, single light source from the top
> left, three-quarter front view, centered single subject, saturated but earthy
> garden colours, small soil mound base with a soft contact shadow, no text, no
> face, no eyes, no character expression, plain flat background

Then the subject:

| id | subject clause |
|---|---|
| `sunflower` | a single tall sunflower with a large round golden-yellow bloom, dark brown seed centre with no face, two broad green leaves on the stem |
| `daisy` | a small daisy with white rounded petals and a yellow centre, slim green stem, two narrow leaves |
| `cactus` | a stout ribbed barrel cactus with even spines and a small red-pink flower on top, sitting in dry soil |
| `aloe` | an aloe vera rosette of thick pointed blue-green leaves with pale speckles and soft serrated edges |

Rules that decide whether a generation is usable:

- **No face.** Faces are what made the previous set a copy of someone else's
  characters. Regenerate rather than paint one out.
- **Silhouette test**: fill the result with flat black at 40px — it must still
  read as that plant, and must not be confusable with `sprout`, `clover`,
  `fern`, `tulip` or `toadstool`.
- **Dominant hue** must be the one in the table (yellow / white / green with a
  pink accent / blue-green). These four exist to fill colour gaps in the set.
- Same visual weight as the existing 13 — don't worry about exact framing, the
  pipeline normalises it (`--fit area` matches visual mass).
- Never prompt with a game, franchise, studio or living artist's name, and keep
  the tool's output-rights terms in `docs/licenses/`.

Once the four files are in `art/raw/`:

```bash
python3 scripts/prep_sprites.py --in art/raw --fit area   # rebuild all 17
npm run sprites:check                                     # must exit 0
```

No code change is needed — ids, requires, card names and flavour text are
already wired to these four names.

## Licensing — non-negotiable for both stores

Whatever route the art comes from, record it before it ships:

- **Commissioned**: a written work-for-hire / full-assignment agreement, or at
  minimum a perpetual commercial licence covering app distribution. A Fiverr /
  Upwork order confirmation alone is not an assignment — get it in writing.
- **Asset pack / stock**: keep the licence file and the purchase receipt in the
  repo (`docs/licenses/`). CC0 (e.g. Kenney) and standard royalty-free licences
  are fine; "personal use only" and "editorial use" are not. Attribution-only
  licences (CC-BY) need a credits line in Settings.
- **AI-generated**: use a tool whose terms grant commercial use of outputs
  (Adobe Firefly is trained on licensed stock and is the conservative pick).
  Never prompt with a franchise or a living artist's name — that is how the
  current set happened.

Still open after the sprite swap:

- **App icon and splash** — `assets/icon.png`, `assets/splash-icon.png`,
  `assets/android-icon-foreground.png`, `assets/android-icon-monochrome.png`,
  `assets/favicon.png` still show the copied Sunflower and Cherries. Rebuild
  them from the new set (the icon is a 4-plant board tile + a `PLANTDOKU`
  wordmark; note the current one renders it "PLANTDÓKU" with a stray accent).
- **Git history** — the infringing PNGs are deleted from the working tree but
  remain in past commits. If the repo is or becomes public, scrub them with
  `git filter-repo`; for a private repo, deleting them is enough.
