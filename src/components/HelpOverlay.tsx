import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { useBackHandler } from "../hooks/useBackHandler";
import { radius, theme } from "../theme";
import { Button } from "./Button";

interface Props {
  onClose: () => void;
}

function Row({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowIcon}>{icon}</Text>
      <Text style={styles.rowText}>{text}</Text>
    </View>
  );
}

/** "How to play" card, openable anytime from the game header. */
export function HelpOverlay({ onClose }: Props) {
  // Android back closes the card instead of leaving the game.
  useBackHandler(() => {
    onClose();
    return true;
  });

  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, {
      toValue: 1,
      friction: 6,
      tension: 70,
      useNativeDriver: true,
    }).start();
  }, [enter]);

  return (
    <Animated.View
      style={[
        styles.backdrop,
        {
          opacity: enter.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 1],
            extrapolate: "clamp",
          }),
        },
      ]}
    >
      <Animated.View
        style={[
          styles.card,
          {
            transform: [
              {
                scale: enter.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.8, 1],
                }),
              },
            ],
          },
        ]}
      >
        <Text style={styles.title}>How to play</Text>

        <Text style={styles.section}>GOAL</Text>
        <Row icon="🌱" text="Grow exactly one plant in every row, column and color cluster." />
        <Row icon="🚫" text="No two plants may touch — not even diagonally." />

        <Text style={styles.section}>CONTROLS</Text>
        <Row icon="👆" text="Tap a cell to mark ✕ where no plant can go (tap again to clear)." />
        <Row icon="👆👆" text="Double-tap a cell to place a plant." />
        <Row icon="👉" text="Drag across cells to mark many ✕ — start on an ✕ to erase instead." />

        <Text style={styles.section}>HEARTS</Text>
        <Row icon="❤️" text="You have 3 hearts. Planting on the wrong cell loses one — run out and the board resets." />

        <View style={styles.btnRow}>
          <Button label="Close" variant="solid" onPress={onClose} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(8,16,11,0.74)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: theme.bgAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.panelLine,
    padding: 22,
  },
  title: {
    color: theme.text,
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 6,
  },
  section: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginTop: 14,
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
  },
  rowIcon: {
    fontSize: 16,
    width: 34,
    textAlign: "center",
    marginTop: 1,
  },
  rowText: {
    flex: 1,
    color: theme.text,
    fontSize: 14.5,
    lineHeight: 20,
  },
  btnRow: {
    marginTop: 16,
  },
});
