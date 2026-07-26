// Pure data shared by the generator (headless-safe) and the RN renderer.
// No react-native / asset imports here so this module runs under plain Node.

/** Plant ids — must exactly match the PNG filenames in assets/plants/. */
// Ordered to match CARDS in cards.ts (commons → rares → legendaries); the
// board only ever maps region id → PLANT_IDS[i], so the order is free.
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
 * Region tints — 15 candy-bright hues walking the wheel (blues → teals →
 * greens → yellows → warm → pinks → purples), plus a warm tan. Only `size` of
 * them are used per board (6–9), so the set is deliberately larger than the
 * biggest grid: `assignRegionColors` picks from all of them by maximum
 * perceptual distance, and the extra slack is what lets it keep *touching*
 * clusters far apart. Order here is presentational only — the generator
 * shuffles the pool.
 *
 * These were pastels; they were saturated up and dropped out of the near-white
 * lightness band (a pastel is as much high lightness as low chroma, so
 * saturation alone just made the warm tints milky). Every margin improved or
 * held: nearest pair 24 → 52 redmean units, nearest tile-to-tray 88 → 97.
 *
 * These are the **available** (untouched) tile colours. `Cell.tsx` derives the
 * other two states from each one: a softened tint for ✕-eliminated cells (the
 * hue must survive — see that file) and a more saturated one for a planted
 * cell, so a solved cell is the most vivid thing on the board.
 *
 * Editing this list is free: cosmetics no longer draw from the generator's
 * seeded RNG, so no existing board changes (see `assemble` in generator.ts).
 */
export const REGION_COLORS: string[] = [
  "#9ED0E9", // sky blue
  "#80C1E9", // azure
  "#8ED6CA", // turquoise
  "#84D88E", // spring green
  "#B7E084", // apple green
  "#DEF075", // lime
  "#F9E56A", // butter yellow
  "#F6C36E", // marigold
  "#F59E75", // coral
  "#ED898F", // salmon pink
  "#DE8BB9", // bubblegum
  "#CC92DB", // orchid
  "#AB93E0", // violet
  "#8EAAE3", // cornflower
  "#D2BD7A", // warm tan
];
