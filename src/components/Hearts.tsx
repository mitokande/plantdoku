import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { theme } from "../theme";

interface Props {
  hearts: number; // remaining
  max: number;
}

/** A single heart that pops as it breaks (fills -> empties). */
function Heart({ filled }: { filled: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const prev = useRef(filled);
  useEffect(() => {
    if (prev.current && !filled) {
      // Just lost this heart — give it a quick "break" pop.
      scale.setValue(1.5);
      Animated.spring(scale, {
        toValue: 1,
        friction: 4,
        tension: 140,
        useNativeDriver: true,
      }).start();
    }
    prev.current = filled;
  }, [filled, scale]);

  return (
    <Animated.Text
      selectable={false}
      style={[
        styles.heart,
        filled ? styles.full : styles.lost,
        { transform: [{ scale }] },
      ]}
    >
      {filled ? "♥" : "♡"}
    </Animated.Text>
  );
}

/** Row of hearts showing lives left on the current board. */
export function Hearts({ hearts, max }: Props) {
  return (
    <View style={styles.row}>
      {Array.from({ length: max }, (_, i) => (
        <Heart key={i} filled={i < hearts} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  heart: {
    fontSize: 20,
    fontWeight: "900",
  },
  full: {
    color: theme.danger,
  },
  lost: {
    color: theme.panelLine,
  },
});
