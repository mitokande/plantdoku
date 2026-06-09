import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

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
  return (
    <View
      style={[
        styles.cell,
        {
          width: px,
          height: px,
          backgroundColor: conflict ? theme.dangerTile : color,
        },
      ]}
    >
      {state === "placed" && (
        <>
          <Image
            source={PLANT_SOURCES[plantId]}
            resizeMode="contain"
            style={styles.plant}
          />
          <View pointerEvents="none" style={styles.ring} />
        </>
      )}
      {state === "marked" && (
        <Text style={[styles.mark, { fontSize: px * 0.4 }]}>✕</Text>
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
    opacity: 0.5,
  },
});

// Cells are display-only; the Board owns all touch handling.
export const Cell = React.memo(CellView);
