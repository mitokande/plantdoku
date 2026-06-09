import React, { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, useWindowDimensions } from "react-native";

const COLORS = [
  "#F7C5CC",
  "#FBE0A2",
  "#8BD24F",
  "#A9D8EF",
  "#D7BDE2",
  "#F5B7A6",
  "#FFD66B",
];

interface PieceCfg {
  key: number;
  x: number;
  color: string;
  size: number;
  delay: number;
  duration: number;
  spin: number;
  drift: number;
}

function Piece({ cfg, fallTo }: { cfg: PieceCfg; fallTo: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: cfg.duration,
        delay: cfg.delay,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [cfg, t]);

  const translateY = t.interpolate({
    inputRange: [0, 1],
    outputRange: [-40, fallTo + 40],
  });
  const translateX = t.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, cfg.drift, 0],
  });
  const rotate = t.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", `${cfg.spin}deg`],
  });
  const opacity = t.interpolate({
    inputRange: [0, 0.1, 0.85, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: cfg.x,
        top: 0,
        width: cfg.size,
        height: cfg.size * 1.4,
        backgroundColor: cfg.color,
        borderRadius: 2,
        opacity,
        transform: [{ translateY }, { translateX }, { rotate }],
      }}
    />
  );
}

export function Confetti({ count = 90 }: { count?: number }) {
  const { width, height } = useWindowDimensions();
  const pieces = useMemo<PieceCfg[]>(
    () =>
      Array.from({ length: count }, (_, i) => ({
        key: i,
        x: Math.random() * width,
        color: COLORS[i % COLORS.length],
        size: 7 + Math.random() * 8,
        delay: Math.random() * 900,
        duration: 1900 + Math.random() * 1700,
        spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 360),
        drift: (Math.random() - 0.5) * 90,
      })),
    [width, count],
  );

  return (
    <Animated.View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((cfg) => (
        <Piece key={cfg.key} cfg={cfg} fallTo={height} />
      ))}
    </Animated.View>
  );
}
