// Shared visual system — a bright "morning garden" look: a warm off-white
// canvas, white cards, dark botanical text, and green reserved for progress
// and primary actions.
//
// Surface hierarchy (lightest → darkest): panel (raised card / modal) > bg
// (page canvas) > bgAlt (recessed slots, chips, progress tracks) > panelEdge
// (the chunky 3D bottom edge). Note bg sits *above* bgAlt: the page is a quiet
// near-white canvas and anything "sunken" into a card is darker than it, which
// is what gives a light theme its layers.
//
// Colour is assigned by function, not decoration:
//   accent (green)  primary actions, progress, active selection
//   text            dark forest green — type and icons
//   gold            stars, rewards, card rarity — never a plain card border
//   bed*            the board's tray only
//   soil            the Home wordmark's planted mound only
//   danger          mistakes and hearts only
// `frame` stays deliberately dark — it tints locked-card silhouettes, so it
// must read as a shadow, not a wash. `mark` (the board's ✕ glyph) is the
// opposite case: a soft mid forest green, because most cells on a solved board
// end up eliminated and a dark mark would drown out the plants.

export const theme = {
  bg: "#F3F6EA",
  bgAlt: "#E8F0DE",
  panel: "#FFFFFF",
  panelLine: "#D5DFC9",
  frame: "#2C4433",
  text: "#183426",
  textDim: "#5D7062",
  accent: "#69C938",
  accentDark: "#429A27",
  /** Type/icon colour on top of `accent` — a very dark forest green, not black. */
  onAccent: "#12300F",
  danger: "#E2675A",
  dangerDark: "#9E3D32",
  dangerTile: "#E9A39B",
  /** Type/icon colour on top of `danger`. */
  onDanger: "#33100B",
  mark: "#42604D",
  gold: "#F2B224",
  /** Type/icon colour on top of `gold`. */
  onGold: "#3D2E08",
  // bottom-edge colours for the chunky "3D" hybrid-casual buttons/cards
  panelEdge: "#CBD8BD",
  // The board's bed: a soft sage-grey planter tray. Deliberately low-chroma and
  // a clear step DARKER than every region tile (which are all light pastels), so
  // it frames the grid instead of reading as one more cluster colour. The old
  // warm-wood bed sat only ~58 redmean units from the nearest pastel — closer
  // than two *touching* clusters ever get (55–85, median 76) — which is what
  // made peach and sand tiles bleed into the frame. These clear that bar:
  // bed 88 · bedGap 117 · bedEdge 150 · bedRim 65.
  bed: "#A6B4A4",
  /** Outer border of the tray — its darkest line. */
  bedEdge: "#8FA08D",
  /** Seen in the gaps between tiles: a soft shadow line that separates them. */
  bedGap: "#9CAA9A",
  /** The carved highlight just inside the border. */
  bedRim: "#AEBCAC",
  /** Warm soil — the mound under the Home wordmark's planted bed. */
  soil: "#D9B489",
};

/** Dimming scrim behind modal cards (light theme keeps a soft green shade). */
export const scrim = "rgba(26,45,32,0.55)";

/**
 * One corner-radius scale for the whole app — pick by component role rather
 * than eyeballing a number per file. `cell` is a *fraction* of the tile size
 * (board tiles scale with the grid).
 */
export const radius = {
  sm: 10,
  chip: 12,
  md: 16,
  btn: 20,
  lg: 24,
  modal: 32,
  cell: 0.15,
};

/**
 * One soft shadow system. `card` for resting surfaces, `raised` for the
 * primary button and the tab bar, `modal` for overlay cards. All are soft and
 * vertical — no dark hard-edged drops.
 */
export const shadow = {
  card: {
    shadowColor: "#1C3322",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  raised: {
    shadowColor: "#1C3322",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 7,
  },
  modal: {
    shadowColor: "#0E2114",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 14,
  },
} as const;

/**
 * Type scale. Uppercase + bold + wide tracking all at once reads as shouting,
 * so `overline` (the only uppercase style) keeps tracking modest and everything
 * else stays sentence case.
 */
export const typography = {
  screenTitle: { fontSize: 38, fontWeight: "900" },
  modalTitle: { fontSize: 28, fontWeight: "900" },
  cardTitle: { fontSize: 21, fontWeight: "800" },
  button: { fontSize: 19, fontWeight: "800" },
  body: { fontSize: 16, fontWeight: "500" },
  caption: { fontSize: 13.5, fontWeight: "600" },
  overline: { fontSize: 12.5, fontWeight: "800", letterSpacing: 0.6 },
} as const;

/** 8-point spacing: space(1)=4 · space(2)=8 · space(4)=16 · space(6)=24. */
export const space = (n: number) => n * 4;
