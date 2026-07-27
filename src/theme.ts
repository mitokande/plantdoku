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
// opposite case: a mid forest green, deliberately not near-black, because most
// cells on a solved board end up eliminated and a dark mark would drown out the
// plants. It still has to be legible at a glance on every region tint, so its
// restraint comes from the thin stroke, not from washing the colour out.

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
  mark: "#2E4A38",
  gold: "#F2B224",
  /** Type/icon colour on top of `gold`. */
  onGold: "#3D2E08",
  // bottom-edge colours for the chunky "3D" hybrid-casual buttons/cards
  panelEdge: "#CBD8BD",

  // ---------------------------------------------------------------------
  // Warm (board-screen) surfaces. The gameplay screen sits on a warm ivory
  // canvas rather than the green-tinted `bg` used by the tabs: it is the one
  // screen where the region pastels have to be the only colour talking, and a
  // neutral-warm page is what lets them. `panelWarm` is its card/chip white
  // and `btnWarm*` its secondary buttons — the same roles `panel`/`panelLine`
  // play elsewhere, in the warm key.
  // ---------------------------------------------------------------------
  bgWarm: "#FEF8EF",
  panelWarm: "#FEFAF2",
  /** Recessed warm track (the board screen's progress bar). */
  bgWarmAlt: "#F3EFDA",
  btnWarm: "#FCF2DD",
  btnWarmLine: "#E5CEAD",
  btnWarmEdge: "#E9D6B2",
  /**
   * The board screen's one hero action (Hint). A deep forest green with white
   * type — distinct from `accent`, which is a bright lime that would fight the
   * pastel grid right above it.
   */
  forest: "#4E744B",
  forestEdge: "#375A38",
  /** Type/icon colour on top of `forest`. */
  onForest: "#FFFFFF",

  // The board's bed: a cream planter tray. It reads as a *frame* rather than as
  // one more cluster colour by being warm-neutral and lighter than every tile
  // (the region palette is a set of airy pastels), which is the opposite of the
  // old sage-grey tray — that one worked by being darker than everything.
  // The nearest region tile sits 61 redmean units from the tray (the old sage
  // tray managed 87). The slack is bought back on the tile itself: every tile
  // carries a 1px rim in a deeper shade of its own hue (see `Cell.tsx`), and
  // that rim is 153 from the tray — so a tile's outline no longer depends on
  // the tray being the darker thing. Re-check both together if either changes.
  bed: "#FEF5E1",
  /** Outer border of the tray — its darkest line. */
  bedEdge: "#E3CAA6",
  /** Seen in the gaps between tiles: a hair deeper than the tray face. */
  bedGap: "#FCF1D9",
  /** The carved highlight ring set just inside the border. */
  bedRim: "#EFDCBE",
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
  /** The board's tray. */
  tray: 22,
  cell: 0.2,
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
