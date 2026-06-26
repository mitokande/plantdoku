import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { radius, theme } from "../theme";
import { Button } from "./Button";

interface Props {
  title: string; // e.g. "Level 7" / "Daily #12" / "Endless"
  onRetry: () => void;
  onMenu: () => void;
}

/** Game-over card shown when the player runs out of hearts on a board. */
export function FailOverlay({ title, onRetry, onMenu }: Props) {
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
          Too many plants in the wrong spot. Take another run at it!
        </Text>

        <View style={styles.actions}>
          <Button label="Menu" icon="menu" onPress={onMenu} flex />
          <Button
            label="Try again"
            icon="refresh"
            variant="solid"
            onPress={onRetry}
            flex
          />
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
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 22,
    alignSelf: "stretch",
  },
});
