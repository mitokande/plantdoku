import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { formatTime } from "../format";
import { radius, theme } from "../theme";
import { Button } from "./Button";
import { Confetti } from "./Confetti";

interface Props {
  seconds: number;
  bestSeconds?: number;
  isNewBest: boolean;
  onPlayAgain: () => void;
  onMenu: () => void;
}

export function WinOverlay({
  seconds,
  bestSeconds,
  isNewBest,
  onPlayAgain,
  onMenu,
}: Props) {
  return (
    <View style={styles.backdrop}>
      <Confetti />
      <View style={styles.card}>
        <Text style={styles.emoji}>🌱</Text>
        <Text style={styles.title}>Solved!</Text>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>TIME</Text>
            <Text style={styles.statVal}>{formatTime(seconds)}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>BEST</Text>
            <Text style={styles.statVal}>{formatTime(bestSeconds)}</Text>
          </View>
        </View>

        {isNewBest && <Text style={styles.newBest}>★ New best time!</Text>}

        <View style={styles.actions}>
          <Button label="Menu" icon="☰" onPress={onMenu} flex />
          <Button
            label="Play again"
            icon="↻"
            variant="solid"
            onPress={onPlayAgain}
            flex
          />
        </View>
      </View>
    </View>
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
    maxWidth: 360,
    backgroundColor: theme.bgAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.panelLine,
    padding: 24,
    alignItems: "center",
  },
  emoji: {
    fontSize: 44,
  },
  title: {
    color: theme.text,
    fontSize: 32,
    fontWeight: "900",
    marginTop: 4,
  },
  stats: {
    flexDirection: "row",
    gap: 32,
    marginTop: 18,
  },
  stat: {
    alignItems: "center",
  },
  statLabel: {
    color: theme.textDim,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  statVal: {
    color: theme.text,
    fontSize: 26,
    fontWeight: "800",
    marginTop: 2,
  },
  newBest: {
    color: theme.gold,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 14,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 22,
    alignSelf: "stretch",
  },
});
