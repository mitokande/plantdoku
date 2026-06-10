import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { formatTime } from "../format";
import { radius, theme } from "../theme";
import { Button } from "./Button";
import { Confetti } from "./Confetti";

interface Props {
  level: number;
  seconds: number;
  bestSeconds?: number;
  isNewBest: boolean;
  hasNext: boolean;
  onNext: () => void;
  onMenu: () => void;
}

export function WinOverlay({
  level,
  seconds,
  bestSeconds,
  isNewBest,
  hasNext,
  onNext,
  onMenu,
}: Props) {
  // Springy entrance: backdrop fades while the card scales up with overshoot.
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, {
      toValue: 1,
      friction: 6,
      tension: 70,
      useNativeDriver: true,
    }).start();
  }, [enter]);

  // "New best" badge pulses for that arcade-y reward feel.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isNewBest) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 550,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 550,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isNewBest, pulse]);

  const fade = enter.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  return (
    <Animated.View style={[styles.backdrop, { opacity: fade }]}>
      <Confetti />
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
        <Text style={styles.emoji}>{isNewBest ? "🏆" : "🌱"}</Text>
        <Text style={styles.title}>Level {level} solved!</Text>

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

        {isNewBest && (
          <Animated.Text
            style={[
              styles.newBest,
              {
                transform: [
                  {
                    scale: pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.1],
                    }),
                  },
                ],
              },
            ]}
          >
            ★ New best time!
          </Animated.Text>
        )}

        {!hasNext && (
          <Text style={styles.comingSoon}>More levels coming soon 🌻</Text>
        )}

        <View style={styles.actions}>
          <Button label="Menu" icon="☰" onPress={onMenu} flex />
          {hasNext && (
            <Button
              label="Next level"
              icon="▶"
              variant="solid"
              onPress={onNext}
              flex
            />
          )}
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
  comingSoon: {
    color: theme.textDim,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 14,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 22,
    alignSelf: "stretch",
  },
});
