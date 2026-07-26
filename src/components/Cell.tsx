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

// Inset between tiles — the board's soil shows through the gaps.
const GAP = 1.5;

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
const DRAIN: RGB = toRgb("#EFF2E8");
const SHADE: RGB = toRgb(theme.frame);

/**
 * The three tile states a region colour has to carry. The base tint is the
 * "available" one; a planted cell is the most vivid thing on the board (the
 * player's payoff) and an eliminated one recedes.
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
    planted: toHex(mix(saturate(base, 1.4), WHITE, 0.06)),
    excluded: toHex(mix(saturate(base, 0.82), DRAIN, 0.14)),
    // Medium-contrast silhouette: darkened toward the shade token but kept on
    // the tile's own hue, so it reads as an embossed plant, not a smudge.
    glyph: toHex(mix(saturate(base, 1.15), SHADE, 0.58)),
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
      {/* The rounded tile, inset so the board's soil shows in the gaps.
          overflow:hidden keeps the overlays inside the rounding. */}
      <View
        pointerEvents="none"
        style={[
          styles.tile,
          {
            borderRadius: px * radius.cell,
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
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.bevel]} />
        {!placed && (
          // Embossed watermark of the cluster's plant, replaced by the
          // full-colour sprite on placement.
          <Image
            source={PLANT_SOURCES[plantId]}
            resizeMode="contain"
            style={[
              styles.glyph,
              // On a mistake tile the silhouette follows the red, or the
              // region's green would read as a smudge on the pink.
              { tintColor: mistake ? theme.dangerDark : tint.glyph },
              // Recede further under an ✕ so the mark reads unobstructed.
              state === "marked" && styles.glyphMarked,
            ]}
          />
        )}
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
                outputRange: [0, mistake ? 0.95 : 0.62],
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
            size={px * (mistake ? 0.64 : 0.55)}
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
  },
  // Faint top-light / bottom-shade so each tile reads softly "3D", matching
  // the chunky panelEdge buttons — static, no animation.
  bevel: {
    borderTopWidth: 2,
    borderTopColor: "rgba(255,255,255,0.18)",
    borderBottomWidth: 2,
    borderBottomColor: "rgba(12,23,17,0.09)",
  },
  // The solved cell lifts: a soft drop shadow plus a bright inner rim. This is
  // the loudest thing a tile can be, and it should stay that way — the ✕ is
  // tuned quiet relative to it.
  tilePlaced: {
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.6)",
    shadowColor: "#1C3322",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.26,
    shadowRadius: 5,
    elevation: 4,
  },
  glyph: {
    width: "60%",
    height: "60%",
    opacity: 0.34,
  },
  // Still readable under the ✕: the cluster's colour + shape is what the
  // player reasons with, and an eliminated cell is not out of the puzzle.
  glyphMarked: {
    opacity: 0.2,
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
