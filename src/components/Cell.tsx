import React, { useEffect, useRef } from "react";
import { Animated, Image, StyleSheet, View } from "react-native";

import { PLANT_SOURCES } from "../game/plants";
import type { CellState } from "../game/types";
import { theme } from "../theme";

interface Props {
  px: number;
  state: CellState;
  plantId: string;
  color: string;
  mistake: boolean;
}

// Inset between tiles — the board frame's wood shows through the gaps.
const GAP = 1.5;

/** Darker shade of a #RRGGBB colour, for the embossed glyph tint. */
function darken(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(v * 0.45);
  return (
    "#" +
    [n >> 16, (n >> 8) & 0xff, n & 0xff]
      .map((v) => ch(v).toString(16).padStart(2, "0"))
      .join("")
  );
}

function CellView({ px, state, plantId, color, mistake }: Props) {
  // Pop-in scales for the plant and the ✕ mark (hybrid-casual "juice").
  const plantPop = useRef(
    new Animated.Value(state === "placed" ? 1 : 0),
  ).current;
  const markPop = useRef(new Animated.Value(state === "marked" ? 1 : 0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

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
      markPop.setValue(0.4);
      Animated.spring(markPop, {
        toValue: 1,
        friction: 5,
        tension: 240,
        useNativeDriver: true,
      }).start();
    } else {
      markPop.setValue(0);
    }
  }, [state, plantPop, markPop]);

  // Wrong placements breathe red until the player clears them.
  useEffect(() => {
    if (!mistake) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 420,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 420,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [mistake, pulse]);

  return (
    <View
      // Cells must never be pointer targets, even on web where the Board's
      // "box-only" doesn't shield grandchildren: a drag starting on an ✕/plant
      // element would otherwise lose its move events under react-native-web.
      pointerEvents="none"
      style={[styles.cell, { width: px, height: px }]}
    >
      {/* The rounded "stone" tile, inset so the wooden frame shows in the
          gaps. overflow:hidden keeps the overlays inside the rounding. */}
      <View
        pointerEvents="none"
        style={[
          styles.tile,
          { borderRadius: px * 0.16, backgroundColor: color },
        ]}
      >
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.bevel]} />
        {state !== "placed" && (
          // Embossed watermark of the cluster's plant — a darker-tinted
          // silhouette, replaced by the full-colour sprite on placement.
          <Image
            source={PLANT_SOURCES[plantId]}
            resizeMode="contain"
            style={[styles.glyph, { tintColor: darken(color) }]}
          />
        )}
        {mistake && (
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              styles.mistake,
              {
                opacity: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.35, 0.65],
                }),
              },
            ]}
          />
        )}
        {state === "marked" && (
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              styles.markScrim,
              {
                opacity: markPop.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.1],
                }),
              },
            ]}
          />
        )}
      </View>
      {/* Plant + ✕ live outside the tile so the spring overshoot / scale
          animations aren't clipped by its rounded overflow:hidden box. */}
      {state === "placed" && (
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
        <Animated.Text
          // Unselectable: on web, drag-selecting the ✕ glyph starts a text
          // selection, and react-native-web force-terminates the board's
          // PanResponder on selectionchange — killing the drag mid-gesture.
          selectable={false}
          style={[
            styles.mark,
            {
              fontSize: px * 0.4,
              opacity: markPop.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.5],
              }),
              transform: [{ scale: markPop }],
            },
          ]}
        >
          ✕
        </Animated.Text>
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
    borderTopColor: "rgba(255,255,255,0.16)",
    borderBottomWidth: 2,
    borderBottomColor: "rgba(12,23,17,0.10)",
  },
  glyph: {
    width: "60%",
    height: "60%",
    opacity: 0.25,
  },
  mistake: {
    backgroundColor: theme.danger,
  },
  // Eliminated (✕) cells dim slightly so they recede from the live board.
  markScrim: {
    backgroundColor: theme.frame,
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
    width: "82%",
    height: "82%",
  },
  mark: {
    position: "absolute",
    color: theme.mark,
    fontWeight: "900",
    userSelect: "none",
  },
});

// Cells are display-only; the Board owns all touch handling.
export const Cell = React.memo(CellView);
