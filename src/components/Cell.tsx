import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { PLANT_SOURCES } from "../game/plants";
import type { CellState } from "../game/types";
import { theme } from "../theme";

interface Props {
  px: number;
  state: CellState;
  plantId: string;
  color: string;
  conflict: boolean;
}

function CellView({ px, state, plantId, color, conflict }: Props) {
  // Pop-in scales for the plant and the ✕ mark (hybrid-casual "juice").
  const plantPop = useRef(
    new Animated.Value(state === "placed" ? 1 : 0),
  ).current;
  const markPop = useRef(
    new Animated.Value(state === "marked" ? 1 : 0),
  ).current;
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

  // Conflicting cells breathe red until the violation is fixed.
  useEffect(() => {
    if (!conflict) {
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
  }, [conflict, pulse]);

  return (
    <View
      // Cells must never be pointer targets, even on web where the Board's
      // "box-only" doesn't shield grandchildren: a drag starting on an ✕/plant
      // element would otherwise lose its move events under react-native-web.
      pointerEvents="none"
      style={[styles.cell, { width: px, height: px, backgroundColor: color }]}
    >
      {conflict && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.conflict,
            {
              opacity: pulse.interpolate({
                inputRange: [0, 1],
                outputRange: [0.35, 0.65],
              }),
            },
          ]}
        />
      )}
      {state === "placed" && (
        <Animated.View
          style={[styles.plantWrap, { transform: [{ scale: plantPop }] }]}
        >
          <Animated.Image
            source={PLANT_SOURCES[plantId]}
            resizeMode="contain"
            style={styles.plant}
          />
          <View pointerEvents="none" style={styles.ring} />
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
    // subtle hairline grid only — no bold cluster outlines
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(12,23,17,0.12)",
  },
  conflict: {
    backgroundColor: theme.danger,
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
  ring: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    margin: 2,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: theme.gold,
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
