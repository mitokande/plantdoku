import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { radius, theme } from "../theme";

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
    <View style={styles.bar}>
      {TABS.map(({ key, icon, iconOff, label }) => {
        const active = key === tab;
        return (
          <Pressable
            key={key}
            onPress={() => onTab(key)}
            style={[styles.tab, active && styles.tabActive]}
          >
            <View>
              <Ionicons
                name={active ? icon : iconOff}
                size={23}
                color={active ? theme.accent : theme.textDim}
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
