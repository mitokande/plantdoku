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
 * Region tints — 15 soft pastels walking the hue wheel (blues → teals → greens
 * → yellows → warm → pinks → purples), plus a warm neutral. Only `size` of them
 * are used per board (6–9), so the set is deliberately larger than the biggest
 * grid: `assignRegionColors` picks from all of them by maximum perceptual
 * distance, and the extra slack is what lets it keep *touching* clusters far
 * apart. Order here is presentational only — the generator shuffles the pool.
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
  "#C7DDE8", // powder blue
  "#AFCFE2", // soft sky
  "#B5D8D2", // misty teal
  "#B8D9BC", // mint green
  "#C9DDB0", // fresh sage
  "#DCE5A9", // soft lime
  "#E9DFA3", // butter yellow
  "#E8CFA5", // warm sand
  "#E8BEAA", // soft peach
  "#E7B8BB", // blush pink
  "#DDB5CB", // dusty rose
  "#D5B9DC", // soft lilac
  "#C7BCE0", // lavender
  "#B9C6E1", // periwinkle
  "#D7D2C2", // warm stone
];
