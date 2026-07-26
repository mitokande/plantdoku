import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { shadow, theme, typography } from "../theme";

export type Tab = "home" | "cards" | "daily";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const TABS: { key: Tab; icon: IoniconName; iconOff: IoniconName; label: string }[] = [
  { key: "home", icon: "home", iconOff: "home-outline", label: "Home" },
  { key: "cards", icon: "albums", iconOff: "albums-outline", label: "Cards" },
  { key: "daily", icon: "sunny", iconOff: "sunny-outline", label: "Daily" },
];

interface Props {
  tab: Tab;
  onTab: (tab: Tab) => void;
  /** Show an attention dot on the Daily tab (today not solved yet). */
  dailyDot?: boolean;
}

/** Chunky hybrid-casual bottom tab bar (hidden while a board is in play). */
export function BottomNav({ tab, onTab, dailyDot }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        {TABS.map(({ key, icon, iconOff, label }) => {
          const active = key === tab;
          return (
            <Pressable
              key={key}
              onPress={() => onTab(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
              style={styles.tab}
            >
              {/* The selection marker hugs the icon: a full-width green capsule
                  pulls attention off the screen's own content. */}
              <View style={[styles.iconSlot, active && styles.iconSlotActive]}>
                <Ionicons
                  name={active ? icon : iconOff}
                  size={21}
                  color={active ? theme.onAccent : theme.textDim}
                />
                {key === "daily" && dailyDot && <View style={styles.dot} />}
              </View>
              <Text style={[styles.label, active && styles.labelActive]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Margin on every side detaches the capsule from the screen edges.
  wrap: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    paddingTop: 4,
  },
  bar: {
    flexDirection: "row",
    padding: 6,
    borderRadius: 999,
    backgroundColor: theme.panel,
    ...shadow.raised,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    minHeight: 44,
    paddingVertical: 4,
  },
  iconSlot: {
    width: 52,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  iconSlotActive: {
    backgroundColor: theme.accent,
  },
  dot: {
    position: "absolute",
    top: 2,
    right: 10,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: theme.gold,
    borderWidth: 1.5,
    borderColor: theme.panel,
  },
  label: {
    ...typography.overline,
    color: theme.text,
    fontSize: 11.5,
    marginTop: 2,
  },
  labelActive: {
    color: theme.accentDark,
    fontWeight: "900",
  },
});
