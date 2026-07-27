import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Image, StyleSheet, View } from "react-native";

import { PLANT_SOURCES } from "../game/plants";
import type { CellState } from "../game/types";
import { radius, theme } from "../theme";

interface Props {
  px: number;
  state: CellState;
  plantId: string;
  color: string;
  mistake: boolean;
}

// Inset between tiles — the tray's cream shows through the gaps. Kept narrow:
// the tiles are separated by their own rim (see `tileStates`), so the gap only
// has to keep two rims from touching.
const GAP = 1;

type RGB = [number, number, number];

function toRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 0xff, n & 0xff];
}

function toHex([r, g, b]: RGB): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
      .join("")
  );
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as RGB;
}

/** Push channels away from (k>1) or toward (k<1) their mean — saturation. */
function saturate([r, g, b]: RGB, k: number): RGB {
  const m = (r + g + b) / 3;
  return [m + (r - m) * k, m + (g - m) * k, m + (b - m) * k];
}

const WHITE: RGB = [255, 255, 255];
const DRAIN: RGB = toRgb("#F6F1E4");

/** Scale every channel — darkens (k<1) without touching the hue balance. */
function shade([r, g, b]: RGB, k: number): RGB {
  return [r * k, g * k, b * k];
}

/**
 * The tile states a region colour has to carry. The base tint is the
 * "available" one; a planted cell is the most vivid thing on the board (the
 * player's payoff) and an eliminated one recedes.
 *
 * `rim` and `glyph` are the two deeper shades every tile draws in its *own*
 * hue — a 1px outline and the embossed plant. Both are "more saturated and a
 * little darker", never "mixed toward a neutral": mixing a pastel toward a dark
 * green turned the silhouette into a grey smudge and cost the tile the only cue
 * that says which cluster it belongs to. Keeping them on-hue is also what lets
 * the tray be lighter than the tiles (see `theme.bed`) — a tile is outlined by
 * itself, not by the gap around it.
 *
 * `excluded` is only *softened*, never drained: which cluster a cell belongs to
 * is live information the player is still reasoning with ("one plant per
 * colour" is a rule about cells they've already crossed off too), so the hue has
 * to survive the ✕. The ✕ itself carries the eliminated state — the tile only
 * needs to step back a little, not go grey.
 */
function tileStates(color: string) {
  const base = toRgb(color);
  return {
    available: color,
    planted: toHex(mix(saturate(base, 1.55), WHITE, 0.04)),
    excluded: toHex(mix(saturate(base, 0.8), DRAIN, 0.16)),
    rim: toHex(shade(saturate(base, 1.5), 0.88)),
    glyph: toHex(shade(saturate(base, 1.9), 0.76)),
  };
}

function CellView({ px, state, plantId, color, mistake }: Props) {
  const tint = useMemo(() => tileStates(color), [color]);

  // Pop-in scales for the plant and the ✕ mark (hybrid-casual "juice").
  const plantPop = useRef(
    new Animated.Value(state === "placed" ? 1 : 0),
  ).current;
  const markPop = useRef(new Animated.Value(state === "marked" ? 1 : 0)).current;

  useEffect(() => {
    if (state === "placed") {
      plantPop.setValue(0.2);
      Animated.spring(plantPop, {
        toValue: 1,
        friction: 4,
        tension: 160,
        useNativeDriver: true,
      }).start();
    } else {
      plantPop.setValue(0);
    }
    if (state === "marked") {
      // A "stamp": short travel from 0.8 with a touch of rotation, so marking
      // reads as an act rather than a glyph blinking on.
      markPop.setValue(0.8);
      Animated.spring(markPop, {
        toValue: 1,
        friction: 5,
        tension: 300,
        useNativeDriver: true,
      }).start();
    } else {
      markPop.setValue(0);
    }
  }, [state, plantPop, markPop]);

  const placed = state === "placed";

  return (
    <View
      // Cells must never be pointer targets, even on web where the Board's
      // "box-only" doesn't shield grandchildren: a drag starting on an ✕/plant
      // element would otherwise lose its move events under react-native-web.
      pointerEvents="none"
      style={[styles.cell, { width: px, height: px }]}
    >
      {/* The rounded tile, inset so the tray's cream shows in the gaps.
          overflow:hidden keeps the overlays inside the rounding. */}
      <View
        pointerEvents="none"
        style={[
          styles.tile,
          {
            borderRadius: px * radius.cell,
            // 1px rim in a deeper shade of the tile's own colour: it is what
            // gives every tile a hard edge on a tray that is *lighter* than it.
            borderColor: mistake ? theme.dangerDark : tint.rim,
            // A rejected guess owns its tile outright (`dangerTile`) rather
            // than getting a translucent red wash: red over a botanical green
            // blends to muddy tan, not to "wrong". Losing the cluster hue on
            // at most two cells is worth an unmistakable signal.
            backgroundColor: mistake
              ? theme.dangerTile
              : placed
                ? tint.planted
                : state === "marked"
                  ? tint.excluded
                  : tint.available,
          },
          // A planted cell sits slightly proud of the board.
          placed && styles.tilePlaced,
        ]}
      >
        {/* Embossed watermark of the cluster's plant, hidden under the
            full-colour sprite once the cell is planted.

            This Image is **always mounted** and only fades — do NOT put it
            behind `{!placed && …}`. Conditionally mounting it meant that on
            Android a cell which had ever held a plant lost its silhouette
            permanently: the tinted Image never drew again once it had been
            unmounted and remounted into a recycled native view. It showed up
            as blank tiles at every position planted earlier in the session. */}
        <Image
          source={PLANT_SOURCES[plantId]}
          resizeMode="contain"
          style={[
            styles.glyph,
            {
              // On a mistake tile the silhouette follows the red, or the
              // region's green would read as a smudge on the pink.
              tintColor: mistake ? theme.dangerDark : tint.glyph,
              // Full strength on an untouched tile: the silhouette is the
              // cluster's second identity cue after its colour, and on a pastel
              // grid the colours alone are a narrow band. It still recedes hard
              // under an ✕ so the mark reads unobstructed.
              opacity: placed ? 0 : state === "marked" ? 0.16 : 1,
            },
          ]}
        />
      </View>
      {/* Plant + ✕ live outside the tile so the spring overshoot / scale
          animations aren't clipped by its rounded overflow:hidden box. */}
      {placed && (
        <Animated.View
          style={[styles.plantWrap, { transform: [{ scale: plantPop }] }]}
        >
          <Animated.Image
            source={PLANT_SOURCES[plantId]}
            resizeMode="contain"
            style={styles.plant}
          />
        </Animated.View>
      )}
      {state === "marked" && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.markWrap,
            {
              opacity: markPop.interpolate({
                inputRange: [0, 1],
                outputRange: [0, mistake ? 0.95 : 0.85],
              }),
              transform: [
                { scale: markPop },
                {
                  rotate: markPop.interpolate({
                    inputRange: [0.8, 1],
                    outputRange: ["-7deg", "0deg"],
                    extrapolate: "clamp",
                  }),
                },
              ],
            },
          ]}
        >
          <Ionicons
            // `close-outline` is Ionicons' thinnest, round-capped ✕. Its
            // quietness comes from the thin stroke, the soft green and the
            // opacity — NOT from being small, so it can be sized generously
            // and still stay under the plants. Most cells on a solved board end
            // up eliminated, so a heavy mark turns the board into a field of
            // dark crosses and the player's actual placements stop being the
            // thing you see first. A mistake keeps the stronger treatment:
            // there are only ever a few of them.
            name={mistake ? "close" : "close-outline"}
            size={px * (mistake ? 0.7 : 0.66)}
            color={mistake ? theme.dangerDark : theme.mark}
            // Unselectable: on web, drag-selecting the glyph starts a text
            // selection, and react-native-web force-terminates the board's
            // PanResponder on selectionchange — killing the drag mid-gesture.
            selectable={false}
            allowFontScaling={false}
            style={styles.markGlyph}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    alignItems: "center",
    justifyContent: "center",
  },
  tile: {
    position: "absolute",
    top: GAP,
    left: GAP,
    right: GAP,
    bottom: GAP,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    // Colour comes from `tint.rim` at render time. The tile is otherwise flat —
    // there is no bevel any more, because a top-light/bottom-shade pair on a
    // pastel just muddies it; the rim does the separating instead.
    borderWidth: 1,
  },
  // The solved cell lifts: a soft drop shadow plus a bright inner rim. This is
  // the loudest thing a tile can be, and it should stay that way — the ✕ is
  // tuned quiet relative to it.
  tilePlaced: {
    borderWidth: 1.5,
    // Overrides the per-hue rim: a planted tile is ringed in light, not in a
    // deeper shade of itself, which is half of why it reads as raised.
    borderColor: "rgba(255,255,255,0.75)",
    shadowColor: "#1C3322",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.26,
    shadowRadius: 5,
    elevation: 4,
  },
  // Opacity is set inline per state (see the render): 1 available · 0.16 under
  // an ✕ — still readable, because the cluster's colour and shape is what the
  // player reasons with and an eliminated cell is not out of the puzzle — · 0
  // when planted.
  glyph: {
    width: "60%",
    height: "60%",
  },
  plantWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  plant: {
    width: "84%",
    height: "84%",
  },
  markWrap: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  markGlyph: {
    userSelect: "none",
  },
});

// Cells are display-only; the Board owns all touch handling.
export const Cell = React.memo(CellView);
