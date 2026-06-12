// Pure data shared by the generator (headless-safe) and the RN renderer.
// No react-native / asset imports here so this module runs under plain Node.

/** Plant ids — must exactly match the PNG filenames in assets/plants/. */
export const PLANT_IDS: string[] = [
  "peashooter",
  "sunflower",
  "cactus",
  "chomper",
  "ice-crystal",
  "garlic",
  "leaf",
  "cherries",
  "bluebell",
  "yellow-mushroom",
  "purple-mushroom",
  "aloe",
  "flame",
  "lotus",
  "vine",
  "daisy",
  "purple-spike",
];

/**
 * Region tints. At least as many as the largest board (9).
 * Muted botanical tones — earthy, low-saturation garden colours that sit
 * calmly against the dark "dusk" board. Hues stay evenly spread at matched
 * lightness (light enough for the dark ✕ mark and sprites to read) so no two
 * are near-twins; the generator additionally assigns them so that touching
 * clusters get maximally different colours.
 */
export const REGION_COLORS: string[] = [
  "#D9A49E", // dusty rose
  "#DBB28A", // terracotta clay
  "#D6C98E", // sand
  "#BCC98B", // pale olive
  "#9DC795", // sage
  "#86C9A8", // eucalyptus
  "#84C4BE", // dusty teal
  "#8FB6D6", // rain blue
  "#A3A8D4", // lavender slate
  "#BFA3D1", // wisteria
  "#D2A0C6", // mauve
  "#DBA8B4", // old rose
];
