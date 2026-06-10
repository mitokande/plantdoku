import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { radius, theme } from "../theme";

interface Props {
  label: string;
  icon?: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "solid" | "ghost" | "danger";
  flex?: boolean;
}

// Height of the darker bottom edge that gives buttons their "pressable" depth.
const EDGE = 4;

export function Button({
  label,
  icon,
  onPress,
  disabled,
  variant = "ghost",
  flex,
}: Props) {
  const solid = variant === "solid";
  const danger = variant === "danger";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.edge,
        solid ? styles.edgeSolid : danger ? styles.edgeDanger : styles.edgeGhost,
        flex && { flex: 1 },
        disabled && styles.disabled,
      ]}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.face,
            solid ? styles.faceSolid : danger ? styles.faceDanger : styles.faceGhost,
            pressed && !disabled && styles.facePressed,
          ]}
        >
          {icon ? <Text style={styles.icon}>{icon}</Text> : null}
          <Text
            style={[
              styles.label,
              solid && styles.labelSolid,
              danger && styles.labelDanger,
            ]}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The edge layer shows through below the face; pressing slides the face
  // down over it, so total height never changes.
  edge: {
    borderRadius: radius.md,
  },
  edgeSolid: {
    backgroundColor: theme.accentDark,
  },
  edgeGhost: {
    backgroundColor: theme.panelEdge,
  },
  edgeDanger: {
    backgroundColor: theme.dangerDark,
  },
  face: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    marginBottom: EDGE,
  },
  facePressed: {
    marginTop: EDGE,
    marginBottom: 0,
  },
  faceSolid: {
    backgroundColor: theme.accent,
  },
  faceGhost: {
    backgroundColor: theme.panel,
    borderWidth: 1,
    borderColor: theme.panelLine,
  },
  faceDanger: {
    backgroundColor: theme.danger,
  },
  disabled: {
    opacity: 0.4,
  },
  icon: {
    fontSize: 16,
  },
  label: {
    color: theme.text,
    fontWeight: "800",
    fontSize: 15,
  },
  labelSolid: {
    color: "#0E2110",
  },
  labelDanger: {
    color: "#33100B",
  },
});
