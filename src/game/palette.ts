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

/** Soft region tints. At least as many as the largest board (9). */
export const REGION_COLORS: string[] = [
  "#F7C5CC", // pink
  "#FBE0A2", // peach
  "#BFE3B0", // mint
  "#A9D8EF", // sky
  "#D7BDE2", // lavender
  "#F5B7A6", // coral
  "#C9E4A6", // lime
  "#F9E79F", // butter
  "#AEDff1", // light blue
  "#F8C9DE", // rose
  "#B5EAD7", // seafoam
  "#E8C6A0", // sand
];
