// RN-only: maps each plant id to its bundled sprite. Kept separate from
// palette.ts so the generator/solver stay importable under plain Node (no
// require('*.png')). Keys must match PLANT_IDS / the files in assets/plants.
// (Metro resolves these at bundle time, so a missing file breaks the build,
// not just a render — ids and art always land together.)

import type { ImageSourcePropType } from "react-native";

export const PLANT_SOURCES: Record<string, ImageSourcePropType> = {
  sprout: require("../../assets/plants/sprout.png"),
  sunflower: require("../../assets/plants/sunflower.png"),
  daisy: require("../../assets/plants/daisy.png"),
  clover: require("../../assets/plants/clover.png"),
  tulip: require("../../assets/plants/tulip.png"),
  cactus: require("../../assets/plants/cactus.png"),
  aloe: require("../../assets/plants/aloe.png"),
  fern: require("../../assets/plants/fern.png"),
  toadstool: require("../../assets/plants/toadstool.png"),
  lavender: require("../../assets/plants/lavender.png"),
  monstera: require("../../assets/plants/monstera.png"),
  waterlily: require("../../assets/plants/waterlily.png"),
  bonsai: require("../../assets/plants/bonsai.png"),
  pitcher: require("../../assets/plants/pitcher.png"),
  frostbloom: require("../../assets/plants/frostbloom.png"),
  emberbud: require("../../assets/plants/emberbud.png"),
  nightspire: require("../../assets/plants/nightspire.png"),
};
