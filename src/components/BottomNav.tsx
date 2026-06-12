import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { radius, theme } from "../theme";

export type Tab = "home" | "cards" | "daily";

const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: "home", icon: "🏠", label: "Home" },
  { key: "cards", icon: "🃏", label: "Cards" },
  { key: "daily", icon: "🌞", label: "Daily" },
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
    <View style={styles.bar}>
      {TABS.map(({ key, icon, label }) => {
        const active = key === tab;
        return (
          <Pressable
            key={key}
            onPress={() => onTab(key)}
            style={[styles.tab, active && styles.tabActive]}
          >
            <View>
              <Text style={[styles.icon, !active && styles.iconInactive]}>
                {icon}
              </Text>
              {key === "daily" && dailyDot && <View style={styles.dot} />}
            </View>
            <Text style={[styles.label, active && styles.labelActive]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: theme.panel,
    borderTopWidth: 1,
    borderTopColor: theme.panelLine,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  tabActive: {
    backgroundColor: theme.bgAlt,
  },
  icon: {
    fontSize: 22,
  },
  iconInactive: {
    opacity: 0.45,
  },
  dot: {
    position: "absolute",
    top: -1,
    right: -7,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.gold,
    borderWidth: 1.5,
    borderColor: theme.panel,
  },
  label: {
    color: theme.textDim,
    fontSize: 11.5,
    fontWeight: "800",
    marginTop: 2,
  },
  labelActive: {
    color: theme.accent,
  },
});
