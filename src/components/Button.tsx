import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { radius, theme } from "../theme";

interface Props {
  label: string;
  icon?: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "solid" | "ghost";
  flex?: boolean;
}

export function Button({
  label,
  icon,
  onPress,
  disabled,
  variant = "ghost",
  flex,
}: Props) {
  const solid = variant === "solid";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        solid ? styles.solid : styles.ghost,
        flex && { flex: 1 },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.inner}>
        {icon ? <Text style={styles.icon}>{icon}</Text> : null}
        <Text style={[styles.label, solid && styles.labelSolid]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  ghost: {
    backgroundColor: theme.panel,
    borderWidth: 1,
    borderColor: theme.panelLine,
  },
  solid: {
    backgroundColor: theme.accent,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  icon: {
    fontSize: 16,
  },
  label: {
    color: theme.text,
    fontWeight: "700",
    fontSize: 15,
  },
  labelSolid: {
    color: "#0E2110",
  },
});
