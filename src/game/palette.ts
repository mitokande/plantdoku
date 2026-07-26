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
 * Region tints. At least as many as the largest board (9).
 *
 * These are the **available** (untouched) tile colours: light botanical
 * pastels. Cell.tsx derives the other two tile states from them — a
 * desaturated wash for ✕-eliminated cells and a brighter one for a planted
 * cell — so a solved cell is the most vivid thing on the board and the base
 * tint stays pale enough for the embossed silhouette and the dark ✕ to read.
 *
 * Hues stay evenly spread at matched lightness so no two are near-twins; the
 * generator additionally assigns them so that touching clusters get maximally
 * different colours.
 */
export const REGION_COLORS: string[] = [
  "#EFB3AB", // dusty rose
  "#EFC79B", // terracotta clay
  "#E6DA9E", // sand
  "#C9DA97", // pale olive
  "#A7D79C", // sage
  "#94D8B4", // eucalyptus
  "#92D6CF", // dusty teal
  "#9DC8E4", // rain blue
  "#B3B8E2", // lavender slate
  "#CBAEDC", // wisteria
  "#E0AED3", // mauve
  "#EDB4C1", // old rose
];
