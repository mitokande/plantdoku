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
 * Botanical tones — garden colours with enough saturation to hold their own
 * against the light "morning garden" ground (a paler set washed out next to
 * the near-white panels). Hues stay evenly spread at matched lightness (light
 * enough for the dark ✕ mark and sprites to read) so no two are near-twins;
 * the generator additionally assigns them so that touching clusters get
 * maximally different colours.
 */
export const REGION_COLORS: string[] = [
  "#E0938B", // dusty rose
  "#E0AC77", // terracotta clay
  "#D8C87A", // sand
  "#B4C775", // pale olive
  "#8CC181", // sage
  "#74C39B", // eucalyptus
  "#71BEB7", // dusty teal
  "#7CAED4", // rain blue
  "#9AA0D2", // lavender slate
  "#B795CC", // wisteria
  "#CE92C0", // mauve
  "#DC9AAA", // old rose
];
