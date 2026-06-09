import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { PLANT_SOURCES } from "../game/plants";
import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  type Difficulty,
} from "../game/types";
import { formatTime } from "../format";
import { radius, theme } from "../theme";

interface Props {
  bestTimes: Partial<Record<Difficulty, number>>;
  onSelect: (d: Difficulty) => void;
}

const DECO = ["sunflower", "cactus", "cherries", "lotus", "bluebell"];

export function DifficultyMenu({ bestTimes, onSelect }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.deco}>
        {DECO.map((id) => (
          <Image key={id} source={PLANT_SOURCES[id]} style={styles.decoImg} />
        ))}
      </View>

      <Text style={styles.title}>Plantdoku</Text>
      <Text style={styles.subtitle}>
        One plant per row, column &amp; cluster — and none touching.
      </Text>

      <View style={styles.list}>
        {DIFFICULTY_ORDER.map((d) => {
          const { size, label } = DIFFICULTIES[d];
          return (
            <Pressable
              key={d}
              onPress={() => onSelect(d)}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View>
                <Text style={styles.cardLabel}>{label}</Text>
                <Text style={styles.cardSub}>
                  {size}×{size} grid
                </Text>
              </View>
              <View style={styles.best}>
                <Text style={styles.bestLabel}>BEST</Text>
                <Text style={styles.bestVal}>{formatTime(bestTimes[d])}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  deco: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 8,
  },
  decoImg: {
    width: 54,
    height: 54,
    marginHorizontal: -2,
    resizeMode: "contain",
  },
  title: {
    color: theme.text,
    fontSize: 46,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 0.5,
  },
  subtitle: {
    color: theme.textDim,
    fontSize: 15,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 28,
    paddingHorizontal: 12,
    lineHeight: 21,
  },
  list: {
    gap: 14,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.panel,
    borderColor: theme.panelLine,
    borderWidth: 1,
    paddingVertical: 20,
    paddingHorizontal: 22,
    borderRadius: radius.lg,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.99 }],
  },
  cardLabel: {
    color: theme.text,
    fontSize: 22,
    fontWeight: "800",
  },
  cardSub: {
    color: theme.textDim,
    fontSize: 14,
    marginTop: 2,
  },
  best: {
    alignItems: "flex-end",
  },
  bestLabel: {
    color: theme.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  bestVal: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 2,
  },
});
