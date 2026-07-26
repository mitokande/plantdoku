import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { theme } from "../theme";

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
              style={[styles.tab, active && styles.tabActive]}
            >
              <View>
                <Ionicons
                  name={active ? icon : iconOff}
                  size={21}
                  color={active ? "#0E2110" : theme.textDim}
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
    gap: 6,
    padding: 6,
    borderRadius: 999,
    backgroundColor: theme.panel,
    borderWidth: 1,
    borderColor: theme.panelLine,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 999,
  },
  tabActive: {
    backgroundColor: theme.accent,
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
    color: "#0E2110",
  },
});
