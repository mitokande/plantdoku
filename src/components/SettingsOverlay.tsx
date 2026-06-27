import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Switch, Text, View } from "react-native";

import { useBackHandler } from "../hooks/useBackHandler";
import { radius, theme } from "../theme";
import { Button } from "./Button";

interface Props {
  soundOn: boolean;
  onToggleSound: (on: boolean) => void;
  notifsOn: boolean;
  onToggleNotifs: (on: boolean) => void;
  onFlush: () => void; // wipes all persisted game data
  onClose: () => void;
}

/**
 * Settings card. The destructive "flush game data" action is guarded by an
 * inline confirm step (no native Alert — it must also work on web).
 */
export function SettingsOverlay({
  soundOn,
  onToggleSound,
  notifsOn,
  onToggleNotifs,
  onFlush,
  onClose,
}: Props) {
  const [stage, setStage] = useState<"idle" | "confirm" | "flushed">("idle");

  // Android back steps out of the destructive confirm first, then closes.
  useBackHandler(() => {
    if (stage === "confirm") setStage("idle");
    else onClose();
    return true;
  });

  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, {
      toValue: 1,
      friction: 6,
      tension: 70,
      useNativeDriver: true,
    }).start();
  }, [enter]);

  return (
    <Animated.View
      style={[
        styles.backdrop,
        {
          opacity: enter.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 1],
            extrapolate: "clamp",
          }),
        },
      ]}
    >
      <Animated.View
        style={[
          styles.card,
          {
            transform: [
              {
                scale: enter.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.8, 1],
                }),
              },
            ],
          },
        ]}
      >
        <Text style={styles.title}>Settings</Text>

        <Text style={styles.section}>SOUND</Text>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Sound effects</Text>
          <Switch
            value={soundOn}
            onValueChange={onToggleSound}
            trackColor={{ false: theme.panelEdge, true: theme.accent }}
            thumbColor={theme.text}
          />
        </View>

        <Text style={styles.section}>NOTIFICATIONS</Text>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Daily &amp; streak reminders</Text>
          <Switch
            value={notifsOn}
            onValueChange={onToggleNotifs}
            trackColor={{ false: theme.panelEdge, true: theme.accent }}
            thumbColor={theme.text}
          />
        </View>

        <Text style={styles.section}>GAME DATA</Text>
        {stage === "idle" && (
          <>
            <Text style={styles.note}>
              Flushing wipes everything: level progress, best times and the
              tutorial.
            </Text>
            <Button
              label="Flush game data"
              icon="trash-outline"
              variant="danger"
              onPress={() => setStage("confirm")}
            />
          </>
        )}
        {stage === "confirm" && (
          <>
            <Text style={styles.note}>
              Really wipe all progress? This cannot be undone.
            </Text>
            <View style={styles.row}>
              <Button label="Cancel" onPress={() => setStage("idle")} flex />
              <Button
                label="Yes, flush"
                variant="danger"
                onPress={() => {
                  onFlush();
                  setStage("flushed");
                }}
                flex
              />
            </View>
          </>
        )}
        {stage === "flushed" && (
          <Text style={styles.note}>All data wiped — fresh start!</Text>
        )}

        <View style={styles.closeRow}>
          <Button label="Close" variant="solid" onPress={onClose} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(8,16,11,0.74)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: theme.bgAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.panelLine,
    padding: 22,
  },
  title: {
    color: theme.text,
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 6,
  },
  section: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginTop: 12,
    marginBottom: 8,
  },
  note: {
    color: theme.textDim,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toggleLabel: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "700",
  },
  closeRow: {
    marginTop: 18,
  },
});
