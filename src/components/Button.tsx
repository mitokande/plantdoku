import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { audio } from "../audio";
import { radius, theme, typography } from "../theme";

interface Props {
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  /** Optional shortcut past a two-press confirmation (see GameScreen's Reset). */
  onLongPress?: () => void;
  disabled?: boolean;
  /**
   * Emphasis, high → low: `solid` (the primary action) · `ghost` (a normal
   * white card button) · `danger` (a destructive step, or one awaiting
   * confirmation). To rank an action *down*, shrink its footprint with
   * `circle` rather than draining its contrast — a low-contrast button reads
   * as disabled, not as secondary.
   */
  variant?: "solid" | "ghost" | "danger";
  flex?: boolean;
  badge?: number; // info count in a gold corner bubble; hidden when 0/undefined
  small?: boolean; // compact pill
  /** Drop the label and show just the icon (the label becomes the a11y name). */
  iconOnly?: boolean;
  /**
   * Icon in a fixed round face, the same height as a normal button so it sits
   * on the baseline of a control row. Use it to rank a secondary action *down*
   * by footprint while keeping it in the same white-button family — which is
   * what stops it reading as disabled the way an outline-only button does.
   */
  circle?: boolean;
}

// Height of the darker bottom edge that gives buttons their "pressable" depth.
const EDGE = 4;

export function Button({
  label,
  icon,
  onPress,
  onLongPress,
  disabled,
  variant = "ghost",
  flex,
  badge,
  small,
  iconOnly,
  circle,
}: Props) {
  const bare = iconOnly || circle;
  const solid = variant === "solid";
  const danger = variant === "danger";
  const fg = solid ? theme.onAccent : danger ? theme.onDanger : theme.text;
  return (
    <Pressable
      onPress={() => {
        audio.play("button");
        onPress();
      }}
      onLongPress={
        onLongPress &&
        (() => {
          audio.play("button");
          onLongPress();
        })
      }
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.edge,
        solid ? styles.edgeSolid : danger ? styles.edgeDanger : styles.edgeGhost,
        circle && styles.edgeCircle,
        flex && { flex: 1 },
        disabled && styles.disabled,
      ]}
    >
      {({ pressed }) => (
        <>
          <View
            style={[
              styles.face,
              solid ? styles.faceSolid : danger ? styles.faceDanger : styles.faceGhost,
              small && styles.faceSmall,
              iconOnly && styles.faceIconOnly,
              circle && styles.faceCircle,
              pressed && !disabled && styles.facePressed,
            ]}
          >
            {icon ? (
              <Ionicons
                name={icon}
                size={bare ? 22 : small ? 15 : 18}
                color={fg}
              />
            ) : null}
            {!bare && (
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
  edgeCircle: {
    borderRadius: 999,
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
  // 44 + EDGE matches a normal button's 44 face + EDGE, so a circle and a
  // full-size button in the same row share a baseline.
  faceCircle: {
    width: 44,
    height: 44,
    minHeight: 44,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderRadius: 999,
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
