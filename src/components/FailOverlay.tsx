import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { overlayZ, radius, scrim, shadow, theme } from "../theme";
import { Button } from "./Button";

interface Props {
  title: string; // e.g. "Level 7" / "Daily #12" / "Endless"
  /** Current balance, so the card can show progress toward an unaffordable revive. */
  coins: number;
  reviveCost: number;
  onRevive: () => void;
  onRetry: () => void;
  onMenu: () => void;
}

/**
 * Game-over card shown when the player runs out of hearts on a board.
 *
 * Revive is the hero here — it is the one action that keeps the board the
 * player was losing, which is the whole point of the currency. When it can't
 * be afforded it stays visible as a **progress line** (`340 / 500`) rather than
 * disappearing or reading as a dead control: at 20 coins a level the first
 * revive lands around level 25, so most players meet this button before they
 * can use it, and it has to read as a goal.
 */
export function FailOverlay({
  title,
  coins,
  reviveCost,
  onRevive,
  onRetry,
  onMenu,
}: Props) {
  const affordable = coins >= reviveCost;
  // Springy entrance, matching WinOverlay.
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, {
      toValue: 1,
      friction: 6,
      tension: 70,
      useNativeDriver: true,
    }).start();
  }, [enter]);

  const fade = enter.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  return (
    <Animated.View style={[styles.backdrop, { opacity: fade }]}>
      <Animated.View
        style={[
          styles.card,
          {
            transform: [
              {
                scale: enter.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.7, 1],
                }),
              },
            ],
          },
        ]}
      >
        <Ionicons name="heart-dislike" size={48} color={theme.danger} />
        <Text style={styles.title}>Out of hearts</Text>
        <Text style={styles.sub}>{title}</Text>
        <Text style={styles.body}>
          {affordable
            ? "Buy a heart back and pick up right where you left off."
            : "Too many plants in the wrong spot. Take another run at it!"}
        </Text>

        {/* The paid continue, at full width above the free options. */}
        <View style={styles.revive}>
          <Button
            label={`Revive · ${reviveCost}`}
            icon="heart"
            variant="solid"
            disabled={!affordable}
            onPress={onRevive}
          />
          <View style={styles.reviveMeta}>
            <Ionicons
              name="cash"
              size={13}
              color={affordable ? theme.gold : theme.textDim}
            />
            <Text style={styles.reviveMetaTxt}>
              {affordable
                ? `${coins} coins · keeps your board`
                : `${coins} / ${reviveCost} coins`}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Button label="Menu" icon="menu" onPress={onMenu} flex />
          <Button label="Try again" icon="refresh" onPress={onRetry} flex />
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
    ...overlayZ,
    backgroundColor: scrim,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: theme.panel,
    borderRadius: radius.modal,
    ...shadow.modal,
    padding: 24,
    alignItems: "center",
  },
  title: {
    color: theme.text,
    fontSize: 30,
    fontWeight: "900",
    marginTop: 8,
  },
  sub: {
    color: theme.accent,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  body: {
    color: theme.textDim,
    fontSize: 14,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 12,
  },
  // The paid continue sits alone at full width; Menu / Try again share the row
  // below it, so the hierarchy is unmistakable without shouting.
  revive: {
    alignSelf: "stretch",
    marginTop: 20,
  },
  reviveMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: 8,
  },
  reviveMetaTxt: {
    color: theme.textDim,
    fontSize: 12.5,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
    alignSelf: "stretch",
  },
});
