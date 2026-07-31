// Animated launch splash — the beat between the static native splash and the
// app shell. Sequence (see SPLASH_MS for the total): the planter tray drops in
// → its six pastel tiles pop in one by one → a sprout rises out of the middle
// with a few drifting leaf sparks → wordmark, tagline, then a loading bar that
// fills and hands over.
//
// It is a *cosmetic* beat, never a gate: `onDone` is backstopped by a timer, a
// tap anywhere skips straight to the end, and nothing here touches game state.
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { REGION_COLORS } from "../game/palette";
import { PLANT_SOURCES } from "../game/plants";
import { radius, space, theme, typography } from "../theme";
import { Tappable } from "./Tappable";

/** Whole beat, from first frame to the fade-out finishing. */
export const SPLASH_MS = 2900;

const FADE_MS = 320;

// The mark: a 3×3 slice of a board, sized like the real thing (rounded tiles
// with the bed showing through the gaps). The tray's border eats into its own
// width (RN boxes are border-box), so TILE has to subtract it — leave it out
// and the third tile in each row wraps out of the tray.
const MARK = 200;
const TRAY_PAD = 12;
const TRAY_BORDER = 3;
const TILE_GAP = 8;
const GRID = 3;
const INNER = MARK - (TRAY_PAD + TRAY_BORDER) * 2;
// Floored: an exact fit can still wrap once RN rounds to the pixel grid.
const TILE = Math.floor((INNER - TILE_GAP * (GRID - 1)) / GRID);

// Nine tints walking the palette, so the mark reads as a Plantdoku board.
// Index 4 is the centre tile — the one that gets planted. Indices are taken
// mod the palette length so shrinking or growing REGION_COLORS can never leave
// a tile `undefined` (which renders as a transparent hole, not as an error).
const TILES = [0, 3, 6, 9, 1, 2, 8, 7, 4].map(
  (i) => REGION_COLORS[i % REGION_COLORS.length],
);
const PLANTED = 4;

// The plant grows *out of* the centre tile rather than floating over the whole
// mark — at hero size the sprite detaches from the board and reads as a
// sticker (which is what it looked like), so it stays cell-scaled.
const PLANT = TILE * 1.7;
/** Top of the sprite, so its base lands just past the centre tile's bottom. */
const PLANT_TOP = TRAY_PAD + TRAY_BORDER + 2 * TILE + TILE_GAP + 6 - PLANT;

// Leaf sparks drifting off the sprout: [startX, startY, driftX, driftY, deg].
const SPARKS: [number, number, number, number, number][] = [
  [-46, -4, -26, -44, -52],
  [44, -18, 28, -48, 28],
  [-22, -46, -26, -36, 16],
  [30, 16, 24, -40, 67],
];

/** 0→1 driver, started after `delay` ms. */
function useBeat(delay: number, duration: number, easing = Easing.out(Easing.cubic)) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(t, {
      toValue: 1,
      duration,
      delay,
      easing,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [t, delay, duration, easing]);
  return t;
}

function Tile({ color, index }: { color: string; index: number }) {
  const t = useBeat(280 + index * 55, 520, Easing.out(Easing.back(2)));
  return (
    <Animated.View
      style={[
        styles.tile,
        // The centre tile is the planted one, so it gets the board's planted
        // treatment: a bright inner rim lifting it off the tray.
        index === PLANTED && styles.tilePlanted,
        {
          backgroundColor: color,
          opacity: t,
          transform: [
            { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.52, 1] }) },
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
          ],
        },
      ]}
    />
  );
}

function Spark({ spec, index }: { spec: (typeof SPARKS)[number]; index: number }) {
  const [x, y, dx, dy, deg] = spec;
  const t = useBeat(1050 + index * 60, 1350, Easing.out(Easing.quad));
  return (
    <Animated.View
      style={[
        styles.spark,
        {
          left: MARK / 2 + x,
          top: MARK / 2 + y,
          opacity: t.interpolate({
            inputRange: [0, 0.22, 0.6, 1],
            outputRange: [0, 1, 0.85, 0],
          }),
          transform: [
            { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
            { rotate: `${deg}deg` },
            { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) },
          ],
        },
      ]}
    />
  );
}

interface Props {
  /** Fires once the beat (and its fade-out) is over. */
  onDone: () => void;
}

export function SplashScreen({ onDone }: Props) {
  const tray = useBeat(50, 720, Easing.out(Easing.back(1.6)));
  const sprout = useBeat(820, 900, Easing.out(Easing.back(2.2)));
  const title = useBeat(1360, 720, Easing.out(Easing.back(1.3)));
  const tagline = useBeat(1720, 550);
  const loading = useBeat(1900, 450);

  // The bar fills on its own driver (a width animation can't run natively, so
  // it scales a full-width fill from its left edge instead).
  const bar = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(bar, {
      toValue: 1,
      duration: 900,
      delay: 2000,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [bar]);

  // Fade out and hand over. `done` guards the two routes in (the timer and a
  // skip tap) so onDone can only fire once.
  const fade = useRef(new Animated.Value(1)).current;
  const done = useRef(false);
  const skipRef = useRef<() => void>(() => {});
  const finish = useRef(onDone);
  finish.current = onDone;
  useEffect(() => {
    const end = () => {
      if (done.current) return;
      done.current = true;
      Animated.timing(fade, {
        toValue: 0,
        duration: FADE_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => finish.current());
    };
    const id = setTimeout(end, SPLASH_MS - FADE_MS);
    skipRef.current = end;
    return () => clearTimeout(id);
  }, [fade, skipRef]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: fade }]}>
      <LinearGradient
        colors={["#F8FAF1", theme.bg, "#EDF4E1"]}
        style={StyleSheet.absoluteFill}
      />
      {/* Silent: skipping the intro is impatience rather than a control, and
          the splash runs before the player has chosen to be in the app at all —
          a click here would be the first sound the game ever makes. */}
      <Tappable
        silent
        style={styles.stage}
        onPress={() => skipRef.current()}
        accessibilityRole="button"
        accessibilityLabel="Skip intro"
      >
        <View style={styles.mark}>
          <Animated.View
            style={[
              styles.tray,
              {
                opacity: tray,
                transform: [
                  { rotate: "-2deg" },
                  { scale: tray.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1] }) },
                ],
              },
            ]}
          >
            {TILES.map((color, i) => (
              <Tile key={i} color={color} index={i} />
            ))}
          </Animated.View>

          <Animated.View
            style={[
              styles.sprout,
              {
                opacity: sprout,
                transform: [
                  {
                    translateY: sprout.interpolate({
                      inputRange: [0, 1],
                      outputRange: [26, 0],
                    }),
                  },
                  { scale: sprout.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) },
                ],
              },
            ]}
          >
            <Image source={PLANT_SOURCES.sprout} style={styles.sproutImg} resizeMode="contain" />
          </Animated.View>

          {SPARKS.map((spec, i) => (
            <Spark key={i} spec={spec} index={i} />
          ))}
        </View>

        <Animated.Text
          style={[
            styles.title,
            {
              opacity: title,
              transform: [
                { translateY: title.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
              ],
            },
          ]}
        >
          Plantdoku
        </Animated.Text>

        <Animated.Text
          style={[
            styles.tagline,
            {
              opacity: tagline,
              transform: [
                { translateY: tagline.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
              ],
            },
          ]}
        >
          Think smart. Grow calm.
        </Animated.Text>

        <Animated.View style={[styles.loading, { opacity: loading }]}>
          <View style={styles.track}>
            <Animated.View
              style={[
                styles.bar,
                {
                  transform: [
                    {
                      scaleX: bar.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.02, 1],
                      }),
                    },
                  ],
                },
              ]}
            />
          </View>
          <Text style={styles.loadingCopy}>Growing your garden</Text>
        </Animated.View>
      </Tappable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // On Android, elevation — not document order — decides what draws on top, so
  // this has to out-rank the tab bar's `shadow.raised` (elevation 7) or the
  // bottom nav shows through the splash.
  root: {
    zIndex: 100,
    elevation: 100,
  },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: space(10),
  },
  mark: {
    width: MARK,
    height: MARK,
    marginBottom: space(6),
  },
  tray: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: TILE_GAP,
    padding: TRAY_PAD,
    borderRadius: 39,
    backgroundColor: theme.bed,
    borderWidth: TRAY_BORDER,
    borderColor: theme.bedEdge,
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: TILE * radius.cell + 6,
  },
  tilePlanted: {
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.65)",
  },
  // Sits on the centre tile with its base at that tile's bottom edge, and
  // scales up from that base, so it reads as growing out of the cell.
  sprout: {
    position: "absolute",
    left: 0,
    right: 0,
    top: PLANT_TOP,
    height: PLANT,
    alignItems: "center",
    transformOrigin: "bottom center",
  },
  sproutImg: {
    width: PLANT,
    height: PLANT,
  },
  spark: {
    position: "absolute",
    width: 8,
    height: 18,
    borderTopLeftRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: theme.accent,
  },
  title: {
    ...typography.screenTitle,
    fontSize: 52,
    letterSpacing: -1.6,
    color: theme.text,
  },
  tagline: {
    ...typography.body,
    fontWeight: "700",
    color: theme.textDim,
    marginTop: space(3),
  },
  loading: {
    width: 190,
    marginTop: space(8),
    alignItems: "center",
  },
  track: {
    width: "100%",
    height: 8,
    borderRadius: radius.chip,
    backgroundColor: theme.bgAlt,
    overflow: "hidden",
  },
  bar: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.chip,
    backgroundColor: theme.accent,
    transformOrigin: "left",
  },
  loadingCopy: {
    ...typography.overline,
    color: theme.textDim,
    textTransform: "uppercase",
    marginTop: space(3),
  },
});
