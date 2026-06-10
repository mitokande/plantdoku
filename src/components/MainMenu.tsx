import React, { useEffect, useRef } from "react";
import { Animated, Image, Pressable, StyleSheet, Text, View } from "react-native";

import { PLANT_SOURCES } from "../game/plants";
import { LEVEL_COUNT } from "../game/levels";
import { radius, theme } from "../theme";

interface Props {
  unlockedLevel: number;
  allComplete: boolean;
  onPlay: () => void;
  onSettings: () => void;
}

const DECO = ["sunflower", "cactus", "cherries", "lotus", "bluebell"];

// Play button "3D" bottom-edge height (matches the Button treatment).
const EDGE = 5;

/** Springs children up + in, staggered by `delay` ms. */
function Rise({ delay, children }: { delay: number; children: React.ReactNode }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(t, {
      toValue: 1,
      delay,
      friction: 7,
      tension: 70,
      useNativeDriver: true,
    }).start();
  }, [t, delay]);
  return (
    <Animated.View
      style={{
        opacity: t.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 1],
          extrapolate: "clamp",
        }),
        transform: [
          {
            translateY: t.interpolate({
              inputRange: [0, 1],
              outputRange: [24, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

export function MainMenu({ unlockedLevel, allComplete, onPlay, onSettings }: Props) {
  return (
    <View style={styles.wrap}>
      <Pressable hitSlop={10} onPress={onSettings} style={styles.settingsBtn}>
        <Text style={styles.settingsTxt}>⚙</Text>
      </Pressable>

      <Rise delay={0}>
        <View style={styles.deco}>
          {DECO.map((id) => (
            <Image key={id} source={PLANT_SOURCES[id]} style={styles.decoImg} />
          ))}
        </View>

        <Text style={styles.title}>Plantdoku</Text>
        <Text style={styles.subtitle}>
          One plant per row, column &amp; cluster — and none touching.
        </Text>
      </Rise>

      <Rise delay={150}>
        {allComplete ? (
          <View style={styles.doneCard}>
            <Text style={styles.doneEmoji}>🌻</Text>
            <Text style={styles.doneTitle}>All levels complete!</Text>
            <Text style={styles.doneSub}>More levels coming soon.</Text>
          </View>
        ) : (
          <Pressable onPress={onPlay} style={styles.playEdge}>
            {({ pressed }) => (
              <View style={[styles.play, pressed && styles.playPressed]}>
                <Text style={styles.playLabel}>Play</Text>
                <Text style={styles.playSub}>
                  Level {unlockedLevel} / {LEVEL_COUNT}
                </Text>
              </View>
            )}
          </Pressable>
        )}
      </Rise>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  settingsBtn: {
    position: "absolute",
    top: 10,
    right: 18,
    zIndex: 1,
    padding: 6,
  },
  settingsTxt: {
    color: theme.textDim,
    fontSize: 26,
  },
  deco: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 8,
  },
  decoImg: {
    width: 54,
    height: 54,
    marginHorizontal: -2,
    resizeMode: "contain",
  },
  title: {
    color: theme.text,
    fontSize: 46,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 0.5,
  },
  subtitle: {
    color: theme.textDim,
    fontSize: 15,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 32,
    paddingHorizontal: 12,
    lineHeight: 21,
  },
  playEdge: {
    borderRadius: radius.lg,
    backgroundColor: theme.accentDark,
    alignSelf: "center",
    width: "80%",
    maxWidth: 320,
  },
  play: {
    alignItems: "center",
    backgroundColor: theme.accent,
    paddingVertical: 18,
    borderRadius: radius.lg,
    marginBottom: EDGE,
  },
  playPressed: {
    marginTop: EDGE,
    marginBottom: 0,
  },
  playLabel: {
    color: "#0E2110",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  playSub: {
    color: "#0E2110",
    fontSize: 14,
    fontWeight: "800",
    opacity: 0.75,
    marginTop: 2,
  },
  doneCard: {
    alignItems: "center",
    alignSelf: "center",
    width: "80%",
    maxWidth: 320,
    backgroundColor: theme.panel,
    borderColor: theme.panelLine,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: 22,
  },
  doneEmoji: {
    fontSize: 36,
  },
  doneTitle: {
    color: theme.text,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 6,
  },
  doneSub: {
    color: theme.textDim,
    fontSize: 14,
    marginTop: 2,
  },
});
