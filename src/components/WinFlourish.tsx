import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, useWindowDimensions } from "react-native";

import { PLANT_SOURCES } from "../game/plants";
import { overlayZ, theme } from "../theme";

/** How long the whole beat runs before the result card takes over. */
export const FLOURISH_MS = 1250;

const SPARKS = 12;
const SPARK_COLORS = [theme.gold, "#FBE0A2", theme.accent, "#FFFFFF"];

interface Props {
  /** Which plant takes the spotlight (the last one planted, or a new card). */
  plantId: string;
  /** Fires once the beat is over — the caller then shows the win modal. */
  onDone: () => void;
}

function Spark({ t, i, radius }: { t: Animated.Value; i: number; radius: number }) {
  // Fixed geometry per index — no Math.random, so a re-render can't make a
  // spark jump mid-flight.
  const angle = (i / SPARKS) * Math.PI * 2;
  const dist = radius * (i % 3 === 0 ? 1 : i % 3 === 1 ? 0.82 : 0.64);
  return (
    <Animated.View
      style={[
        styles.spark,
        {
          backgroundColor: SPARK_COLORS[i % SPARK_COLORS.length],
          opacity: t.interpolate({
            inputRange: [0, 0.15, 0.7, 1],
            outputRange: [0, 1, 0.9, 0],
          }),
          transform: [
            {
              translateX: t.interpolate({
                inputRange: [0, 1],
                outputRange: [0, Math.cos(angle) * dist],
              }),
            },
            {
              translateY: t.interpolate({
                inputRange: [0, 1],
                outputRange: [0, Math.sin(angle) * dist],
              }),
            },
            {
              scale: t.interpolate({
                inputRange: [0, 0.3, 1],
                outputRange: [0.4, 1.2, 0.2],
              }),
            },
          ],
        },
      ]}
    />
  );
}

/**
 * The beat between the last plant landing and the result card: the board dims
 * and the plant you just finished with blooms huge in the middle, with a glow
 * ring and a burst of sparks.
 *
 * Deliberately short and non-interactive — it swallows no touches the player
 * would want (the board is done) and hands over to WinOverlay on its own via
 * `onDone`, so a dropped animation callback can never strand the win screen
 * (the caller also holds a timer as a backstop).
 */
export function WinFlourish({ plantId, onDone }: Props) {
  const { width, height } = useWindowDimensions();
  const size = Math.min(width * 0.62, height * 0.42);

  const pop = useRef(new Animated.Value(0)).current; // sprite entrance
  const ring = useRef(new Animated.Value(0)).current; // expanding halo
  const spark = useRef(new Animated.Value(0)).current; // particle burst
  const out = useRef(new Animated.Value(0)).current; // exit fade

  const source = useMemo(() => PLANT_SOURCES[plantId], [plantId]);

  useEffect(() => {
    const anim = Animated.parallel([
      Animated.spring(pop, {
        toValue: 1,
        friction: 5,
        tension: 90,
        useNativeDriver: true,
      }),
      Animated.timing(ring, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(spark, {
        toValue: 1,
        duration: 850,
        delay: 90,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(out, {
        toValue: 1,
        duration: 260,
        delay: FLOURISH_MS - 260,
        useNativeDriver: true,
      }),
    ]);
    anim.start(({ finished }) => finished && onDone());
    return () => anim.stop();
  }, [pop, ring, spark, out, onDone]);

  if (!source) return null;

  const fade = out.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <Animated.View style={[styles.wrap, { opacity: fade }]} pointerEvents="none">
      <Animated.View
        style={[
          styles.glow,
          {
            width: size * 1.5,
            height: size * 1.5,
            borderRadius: size * 0.75,
            opacity: ring.interpolate({
              inputRange: [0, 0.25, 1],
              outputRange: [0, 0.55, 0],
            }),
            transform: [
              {
                scale: ring.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 1.15],
                }),
              },
            ],
          },
        ]}
      />

      {Array.from({ length: SPARKS }, (_, i) => (
        <Spark key={i} t={spark} i={i} radius={size * 0.85} />
      ))}

      <Animated.View
        style={{
          transform: [
            {
              scale: pop.interpolate({
                inputRange: [0, 1],
                outputRange: [0.2, 1],
              }),
            },
            {
              rotate: pop.interpolate({
                inputRange: [0, 1],
                outputRange: ["-14deg", "0deg"],
              }),
            },
          ],
          opacity: pop.interpolate({
            inputRange: [0, 0.25, 1],
            outputRange: [0, 1, 1],
          }),
        }}
      >
        <Image source={source} style={{ width: size, height: size }} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    // Lighter than the win card's backdrop: the solved board should still read
    // behind the plant, since that is what the player just built.
    backgroundColor: "rgba(26,45,32,0.42)",
    ...overlayZ,
  },
  glow: {
    position: "absolute",
    backgroundColor: theme.gold,
  },
  spark: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});
