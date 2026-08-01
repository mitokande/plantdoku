import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, StyleSheet, Text, View } from "react-native";

import { overlayZ, radius, scrim, shadow, theme } from "../theme";
import { Button } from "./Button";

interface Props {
  /** What one completed ad pays, so the card can't drift from `economy.ts`. */
  hintsPerAd: number;
  /** True while an ad is on screen — the card waits rather than closing. */
  pending: boolean;
  onWatch: () => void;
  onClose: () => void;
}

/**
 * Shown when the Hint button is pressed with an empty stock.
 *
 * Deliberately an *offer*, not an error: the player asked for help and the
 * answer is "yes, here's how", so the card leads with the reward and keeps the
 * decline as a quiet text-weight action. It is also the only place in the app
 * that mentions an ad — the Hint button itself never nags, it just runs out.
 *
 * Note there is no coin price here on purpose: coins buy exactly one thing (a
 * revive), and giving hints a coin price would turn every coin into a
 * comparison. See the hint section of `game/economy.ts`.
 */
export function HintOverlay({ hintsPerAd, pending, onWatch, onClose }: Props) {
  // Springy entrance, matching WinOverlay / FailOverlay.
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
        <View style={styles.icon}>
          <Ionicons name="bulb" size={40} color={theme.gold} />
        </View>
        <Text style={styles.title}>Out of hints</Text>
        <Text style={styles.body}>
          {`Watch a short video for ${hintsPerAd > 1 ? `${hintsPerAd} hints` : "a hint"}, or keep going on your own.`}
        </Text>

        <View style={styles.action}>
          <Button
            label={pending ? "Loading…" : `Watch for +${hintsPerAd}`}
            icon="play-circle"
            variant="solid"
            disabled={pending}
            onPress={onWatch}
          />
          {pending && (
            <View style={styles.pending}>
              <ActivityIndicator size="small" color={theme.textDim} />
            </View>
          )}
        </View>

        {/* Declining is one tap and carries no penalty — a stuck player who
            says no should not have to hunt for the way out. */}
        <Button label="No thanks" variant="ghost" onPress={onClose} small />
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
    maxWidth: 340,
    backgroundColor: theme.panel,
    borderRadius: radius.modal,
    ...shadow.modal,
    padding: 24,
    alignItems: "center",
  },
  icon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.bgAlt,
  },
  title: {
    color: theme.text,
    fontSize: 26,
    fontWeight: "900",
    marginTop: 12,
  },
  body: {
    color: theme.textDim,
    fontSize: 14,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 8,
  },
  action: {
    alignSelf: "stretch",
    marginTop: 20,
    marginBottom: 10,
  },
  pending: {
    marginTop: 10,
    alignItems: "center",
  },
});
