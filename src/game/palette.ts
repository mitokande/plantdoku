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
 * Hues are spaced evenly (~30° apart) at matched saturation/lightness so no
 * two read as near-twins; the generator additionally assigns them so that
 * touching clusters get maximally different colours.
 */
export const REGION_COLORS: string[] = [
  "#F5A9AD", // pink
  "#F6BE8E", // orange
  "#EEDC7C", // yellow
  "#BFE283", // lime
  "#92D993", // green
  "#7EDFB4", // spring
  "#79D9D9", // cyan
  "#88C4F0", // sky
  "#A8AFF4", // blue
  "#C5A5F0", // purple
  "#E2A1E6", // orchid
  "#F4A3CC", // rose
];
