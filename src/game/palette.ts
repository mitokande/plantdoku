// Pure data shared by the generator (headless-safe) and the RN renderer.
// No react-native / asset imports here so this module runs under plain Node.

/** Plant ids — must exactly match the PNG filenames in assets/plants/. */
// Ordered to match CARDS in cards.ts (commons → rares → legendaries); a board
// just picks one of these as its single species, so the order is free.
// Every id must have a file in assets/plants and a require in plants.ts —
// see docs/art-brief.md for the concept + style each id stands for.
export const PLANT_IDS: string[] = [
  "sprout",
  "sunflower",
  "daisy",
  "clover",
  "tulip",
  "cactus",
  "aloe",
  "fern",
  "toadstool",
  "lavender",
  "monstera",
  "waterlily",
  "bonsai",
  "pitcher",
  "frostbloom",
  "emberbud",
  "nightspire",
];

/**
 * Region tints — 11 airy pastels walking the wheel (blues → violets → pinks →
 * warms → yellows → greens → mint). Only `size` of them are used per board
 * (6–9), so the set stays larger than the biggest grid: `assignRegionColors`
 * picks from all of them by maximum perceptual distance, and the extra slack is
 * what lets it keep *touching* clusters far apart. Order here is presentational
 * only — the generator shuffles the pool.
 *
 * These live in a deliberately narrow band — high lightness, moderate chroma,
 * all roughly the same visual weight — because the board's whole look depends
 * on the grid reading as one soft set rather than as eleven competing colours.
 * That band cannot also hold fifteen well-separated hues, which is why the pool
 * shrank from 15 to 11: at 15 the nearest pair fell to ~16 redmean units and the
 * pale warms came within ~45 of the cream tray. At 11 the nearest pair is 29
 * (lavender/orchid) and the nearest tile-to-tray is 61 — see the `bed` note in
 * `theme.ts` for why a tighter tray margin is affordable now.
 *
 * The number that actually matters is the separation between *touching*
 * clusters, and `assignRegionColors`' greedy max-min pick keeps that far above
 * the palette's own floor: median 126 redmean units with a 5th percentile of
 * 82 on every size (the old 15-colour palette managed a median of 76). Only a
 * 9×9, which uses 9 of the 11 and so has almost no slack, ever dips — 3 boards
 * in 400 put a pair under 55, worst case 38 — and even there the two tiles keep
 * different rims. Note the silhouette no longer helps: one board = one plant
 * species (see `Puzzle.plant`), so colour is the *only* thing telling two
 * touching clusters apart, and this separation floor now carries that alone.
 *
 * These are the **available** (untouched) tile colours. `Cell.tsx` derives the
 * rest from each one: a rim and an embossed glyph in deeper shades of the same
 * hue, a softened tint for ✕-eliminated cells (the hue must survive — see that
 * file) and a more saturated one for a planted cell, so a solved cell is the
 * most vivid thing on the board.
 *
 * Editing this list is free: cosmetics no longer draw from the generator's
 * seeded RNG, so no existing board changes (see `assemble` in generator.ts).
 */
export const REGION_COLORS: string[] = [
  "#CBE4F6", // sky blue
  "#C7D2F7", // periwinkle
  "#DECBF5", // lavender
  "#EFCBF2", // orchid
  "#FDCADD", // blossom pink
  "#FCCFC3", // coral
  "#FEE4A3", // butter
  "#F2EFA0", // lemon
  "#CFEDA6", // apple green
  "#B4EBBE", // spring green
  "#C2F0E2", // mint
];
