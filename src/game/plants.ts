// RN-only: maps each plant id to its bundled sprite. Kept separate from
// palette.ts so the generator/solver stay importable under plain Node (no
// require('*.png')). Keys must match PLANT_IDS / the files in assets/plants.

import type { ImageSourcePropType } from "react-native";

export const PLANT_SOURCES: Record<string, ImageSourcePropType> = {
  peashooter: require("../../assets/plants/peashooter.png"),
  sunflower: require("../../assets/plants/sunflower.png"),
  cactus: require("../../assets/plants/cactus.png"),
  chomper: require("../../assets/plants/chomper.png"),
  "ice-crystal": require("../../assets/plants/ice-crystal.png"),
  garlic: require("../../assets/plants/garlic.png"),
  leaf: require("../../assets/plants/leaf.png"),
  cherries: require("../../assets/plants/cherries.png"),
  bluebell: require("../../assets/plants/bluebell.png"),
  "yellow-mushroom": require("../../assets/plants/yellow-mushroom.png"),
  "purple-mushroom": require("../../assets/plants/purple-mushroom.png"),
  aloe: require("../../assets/plants/aloe.png"),
  flame: require("../../assets/plants/flame.png"),
  lotus: require("../../assets/plants/lotus.png"),
  vine: require("../../assets/plants/vine.png"),
  daisy: require("../../assets/plants/daisy.png"),
  "purple-spike": require("../../assets/plants/purple-spike.png"),
};
