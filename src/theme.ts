// Shared visual theme — a bright "morning garden" palette: soft sunlit greens
// with near-white panels, so the botanical region tiles and plant sprites read
// crisply on a phone screen outdoors.
//
// Surface hierarchy (light → dark): panel (raised card) > bgAlt (chips, overlay
// cards) > bg (page + recessed slots inside a panel) > panelEdge (the chunky
// 3D bottom edge). `frame` stays deliberately dark: it tints locked-card
// silhouettes and dims ✕-marked tiles, so it must read as a shadow, not a wash.

export const theme = {
  bg: "#E4EEDA",
  bgAlt: "#F3F8EC",
  panel: "#FFFFFF",
  panelLine: "#D2DFC6",
  frame: "#2C4433",
  text: "#1D3324",
  textDim: "#5A7560",
  accent: "#6FBF3A",
  accentDark: "#4B8F24",
  danger: "#E2675A",
  dangerDark: "#9E3D32",
  dangerTile: "#E9A39B",
  mark: "#2A3F30",
  gold: "#F0B429",
  // bottom-edge colours for the chunky "3D" hybrid-casual buttons/cards
  panelEdge: "#C9D6BE",
  // wooden board frame
  wood: "#C79A6A",
  woodDark: "#A87B4E",
  woodLight: "#E2BF92",
};

/** Dimming scrim behind modal cards (light theme keeps a soft green shade). */
export const scrim = "rgba(26,45,32,0.55)";

export const radius = { sm: 8, md: 14, lg: 22 };
export const space = (n: number) => n * 4;
