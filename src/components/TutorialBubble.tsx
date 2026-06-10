import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { radius, theme } from "../theme";
import { Button } from "./Button";

interface Props {
  step: number; // 1-based display position, e.g. "1/4"
  total: number;
  text: string;
  buttonLabel?: string; // when set, the step advances via this button
  onButton?: () => void;
}

/**
 * Coach-mark card for the first-play tutorial. Springs in on every step
 * change (re-key it with the step) and shows either an action button or,
 * for steps that wait on a board gesture, just the instruction.
 */
export function TutorialBubble({ step, total, text, buttonLabel, onButton }: Props) {
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, {
      toValue: 1,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [enter]);

  return (
    <Animated.View
      style={[
        styles.card,
        {
          opacity: enter.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 1],
            extrapolate: "clamp",
          }),
          transform: [
            {
              translateY: enter.interpolate({
                inputRange: [0, 1],
                outputRange: [14, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.headRow}>
        <Text style={styles.badge}>TUTORIAL</Text>
        <Text style={styles.progress}>
          {step}/{total}
        </Text>
      </View>
      <Text style={styles.text}>{text}</Text>
      {buttonLabel && onButton && (
        <View style={styles.btnRow}>
          <Button label={buttonLabel} variant="solid" onPress={onButton} flex />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: "center",
    width: "94%",
    maxWidth: 440,
    backgroundColor: theme.panel,
    borderColor: theme.accent,
    borderWidth: 2,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 12,
    marginBottom: 10,
  },
  headRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  badge: {
    color: theme.accent,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  progress: {
    color: theme.textDim,
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  text: {
    color: theme.text,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
  btnRow: {
    marginTop: 10,
  },
});
