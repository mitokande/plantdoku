import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { audio } from "../audio";
import { radius, theme, typography } from "../theme";

interface Props {
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  disabled?: boolean;
  /**
   * Emphasis, high → low: `solid` (the primary action) · `ghost` (a normal
   * white card button) · `quiet` (outline only — for rarely-wanted or
   * destructive actions that shouldn't read as peers of the main controls) ·
   * `danger` (a confirmed destructive step).
   */
  variant?: "solid" | "ghost" | "quiet" | "danger";
  flex?: boolean;
  badge?: number; // info count in a gold corner bubble; hidden when 0/undefined
  small?: boolean; // compact pill
  /** Drop the label and show just the icon (the label becomes the a11y name). */
  iconOnly?: boolean;
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
  badge,
  small,
  iconOnly,
}: Props) {
  const solid = variant === "solid";
  const danger = variant === "danger";
  const quiet = variant === "quiet";
  const fg = solid
    ? theme.onAccent
    : danger
      ? theme.onDanger
      : quiet
        ? theme.textDim
        : theme.text;
  return (
    <Pressable
      onPress={() => {
        audio.play("button");
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.edge,
        solid
          ? styles.edgeSolid
          : danger
            ? styles.edgeDanger
            : quiet
              ? styles.edgeQuiet
              : styles.edgeGhost,
        flex && { flex: 1 },
        disabled && styles.disabled,
      ]}
    >
      {({ pressed }) => (
        <>
          <View
            style={[
              styles.face,
              solid
                ? styles.faceSolid
                : danger
                  ? styles.faceDanger
                  : quiet
                    ? styles.faceQuiet
                    : styles.faceGhost,
              small && styles.faceSmall,
              iconOnly && styles.faceIconOnly,
              pressed && !disabled && !quiet && styles.facePressed,
              pressed && !disabled && quiet && styles.faceQuietPressed,
            ]}
          >
            {icon ? (
              <Ionicons
                name={icon}
                size={iconOnly ? 22 : small ? 15 : 18}
                color={fg}
              />
            ) : null}
            {!iconOnly && (
              <Text
                style={[
                  styles.label,
                  { color: fg },
                  small && styles.labelSmall,
                ]}
              >
                {label}
              </Text>
            )}
          </View>
          {badge != null && badge > 0 && (
            <View pointerEvents="none" style={styles.badge}>
              <Text style={styles.badgeTxt}>{badge > 9 ? "9+" : badge}</Text>
            </View>
          )}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The edge layer shows through below the face; pressing slides the face
  // down over it, so total height never changes.
  edge: {
    borderRadius: radius.btn,
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
  // No 3D edge on the quiet variant — that depth is what makes a button look
  // important, and this one deliberately doesn't.
  edgeQuiet: {
    backgroundColor: "transparent",
  },
  face: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.btn,
    marginBottom: EDGE,
  },
  faceSmall: {
    minHeight: 36,
    paddingVertical: 7,
    paddingHorizontal: 12,
    gap: 4,
  },
  faceIconOnly: {
    minWidth: 44,
    paddingHorizontal: 10,
  },
  facePressed: {
    marginTop: EDGE,
    marginBottom: 0,
  },
  faceQuietPressed: {
    backgroundColor: theme.bgAlt,
  },
  faceSolid: {
    backgroundColor: theme.accent,
  },
  faceGhost: {
    backgroundColor: theme.panel,
    borderWidth: 1,
    borderColor: theme.panelLine,
  },
  faceQuiet: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: theme.panelLine,
  },
  faceDanger: {
    backgroundColor: theme.danger,
  },
  disabled: {
    opacity: 0.4,
  },
  // Sits inside the button's own width: at a negative offset it reads as
  // belonging to whichever control happens to sit to its right.
  badge: {
    position: "absolute",
    top: -7,
    right: 6,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: theme.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeTxt: {
    color: theme.onGold,
    fontSize: 11,
    fontWeight: "900",
  },
  label: {
    ...typography.button,
    fontSize: 15,
  },
  labelSmall: {
    fontSize: 13,
  },
});
