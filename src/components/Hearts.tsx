import { Ionicons } from "@expo/vector-icons";
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
    <Animated.View style={{ transform: [{ scale }] }}>
      <Ionicons
        name={filled ? "heart" : "heart-outline"}
        size={22}
        color={filled ? theme.danger : theme.panelLine}
      />
    </Animated.View>
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
});
