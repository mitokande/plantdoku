import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { shadow, theme, typography } from "../theme";
import { Tappable } from "./Tappable";

export type Tab = "home" | "cards" | "daily";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const TABS: { key: Tab; icon: IoniconName; iconOff: IoniconName; label: string }[] = [
  // Home sits in the middle: it is the default tab and the one thumb-reachable
  // slot on the bar, with the two meta tabs flanking it.
  { key: "cards", icon: "albums", iconOff: "albums-outline", label: "Cards" },
  { key: "home", icon: "home", iconOff: "home-outline", label: "Home" },
  { key: "daily", icon: "sunny", iconOff: "sunny-outline", label: "Daily" },
];

// The bar and the selection pill are **capsules with exact radii**, not
// `borderRadius: 999`. A radius larger than half the view's own height is
// out-of-spec, and both platforms are free to fall back to square corners when
// they clamp it (which is what made the active pill render as a rectangle on
// some devices). So every dimension here is fixed and the radius is literally
// half the height — including `LABEL_LINE`, which pins the label's line box so
// font metrics can't push the bar taller than the radius it was given.
const SLOT_W = 52;
const SLOT_H = 30;
const LABEL_LINE = 14;
const LABEL_GAP = 2;
const TAB_PAD_V = 4;
const BAR_PAD = 6;
const TAB_H = TAB_PAD_V * 2 + SLOT_H + LABEL_GAP + LABEL_LINE;
const BAR_H = BAR_PAD * 2 + TAB_H;

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
            <Tappable
              key={key}
              onPress={() => onTab(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
              style={styles.tab}
            >
              {/* The selection marker covers the whole tab — icon and label
                  together — so the selected section reads as one lit block
                  rather than a capsule floating over a dim caption. It is
                  always mounted, carrying its colour AND its radius from the
                  first render, and only its opacity changes — see `pill`. */}
              <View
                pointerEvents="none"
                style={[styles.pill, { opacity: active ? 1 : 0 }]}
              />
              <View style={styles.iconSlot}>
                <Ionicons
                  name={active ? icon : iconOff}
                  size={21}
                  color={active ? theme.onAccent : theme.textDim}
                />
                {key === "daily" && dailyDot && (
                  <View
                    style={[
                      styles.dot,
                      { borderColor: active ? theme.accent : theme.panel },
                    ]}
                  />
                )}
              </View>
              <Text style={[styles.label, active && styles.labelActive]}>
                {label}
              </Text>
            </Tappable>
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
    padding: BAR_PAD,
    height: BAR_H,
    borderRadius: BAR_H / 2,
    backgroundColor: theme.panel,
    ...shadow.raised,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: TAB_H,
    paddingVertical: TAB_PAD_V,
  },
  iconSlot: {
    width: SLOT_W,
    height: SLOT_H,
    alignItems: "center",
    justifyContent: "center",
  },
  // The selection capsule. Two rules here, both learned the hard way on Android
  // (same family as the Cell sprite bug in CLAUDE.md — a native view restyled
  // after mount doesn't always redraw):
  //  1. Colour and radius arrive TOGETHER on first render, and never change.
  //     Toggling `backgroundColor` on a bare rounded view is what made this pill
  //     draw as a hard rectangle — the radius was dropped outright, not clamped.
  //  2. The radius is half the height, not `999`; an out-of-spec radius is at
  //     the platform's mercy when it clamps.
  // Selection is therefore pure opacity on a view that is always mounted.
  // It fills the tab, inset 2px so neighbouring sections never share an edge,
  // and its radius is half the tab's own (fixed) height for the same reason.
  pill: {
    ...StyleSheet.absoluteFillObject,
    marginHorizontal: 2,
    borderRadius: TAB_H / 2,
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
    lineHeight: LABEL_LINE,
    marginTop: LABEL_GAP,
  },
  // On the lit pill the label sits on `accent`, so it takes that fill's own
  // type colour — `accentDark` on green is the low-contrast pair.
  labelActive: {
    color: theme.onAccent,
    fontWeight: "900",
  },
});
