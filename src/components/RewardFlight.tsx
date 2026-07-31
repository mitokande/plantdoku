import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet } from "react-native";

import { overlayZ, theme } from "../theme";

export interface Pt {
  x: number;
  y: number;
}

interface Props {
  /** Window coords the reward flies from — the Home Play button. */
  from: Pt;
  /** Window coords it lands on — the matching HUD pill. */
  to: Pt;
  /** How many sprites to fly (stars: the rating; coins: a small flock). */
  count: number;
  /** Which reward this is. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Ms before the first sprite launches — see `START_DELAY`. */
  delay?: number;
  /** Fired as each sprite lands, so the pill can pop under it. */
  onArrive?: () => void;
  onDone: () => void;
}

const SIZE = 26;
const FLY_MS = 820;
const STAGGER = 155;
// Home's own entrance staggers its rows in; launching into that would look like
// the reward left before the button arrived. A flight that *follows* another
// one passes a shorter delay — the screen has already settled by then.
const START_DELAY = 380;
// The arc is sampled into a polyline: Animated can only interpolate straight
// segments, and ~16 of them read as a curve at this size.
const SAMPLES = 16;

/**
 * The reward beat that pays a solve back to the wallet: stars (then coins) arc
 * from the Home Play button up into their HUD pill after a win.
 *
 * It is purely cosmetic and non-blocking — `pointerEvents="none"`, no game
 * state, and the totals it is "delivering" have *already* been counted.
 * Nothing may ever wait on `onDone`.
 */
export function RewardFlight({
  from,
  to,
  count,
  icon = "star",
  delay = START_DELAY,
  onArrive,
  onDone,
}: Props) {
  const sprites = useRef(
    Array.from({ length: count }, () => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    const anims = sprites.map((v, i) =>
      Animated.timing(v, {
        toValue: 1,
        delay: delay + i * STAGGER,
        duration: FLY_MS,
        // Slow out of the button, quick into the pill — a collected thing
        // should look pulled, not thrown.
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    anims.forEach((a, i) =>
      a.start(({ finished }) => {
        if (!finished) return;
        onArrive?.();
        if (i === anims.length - 1) onDone();
      }),
    );
    return () => anims.forEach((a) => a.stop());
    // Mounted per flight (App keys it), so this runs exactly once.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View style={styles.layer} pointerEvents="none">
      {sprites.map((v, i) => {
        // One quadratic Bézier per sprite, bulging out to the right of the
        // straight line and fanned by index so a flock reads as several paths
        // rather than one thick one.
        const cx = from.x + (to.x - from.x) * 0.5 + 90 + i * 26;
        const cy = from.y - (from.y - to.y) * 0.72 - i * 14;
        const ts = Array.from({ length: SAMPLES + 1 }, (_, s) => s / SAMPLES);
        const bez = (a: number, b: number, c: number, t: number) =>
          (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;

        return (
          <Animated.View
            key={i}
            style={[
              styles.sprite,
              {
                // Snaps in — the burst is the entrance, so a fade would only
                // soften it.
                opacity: v.interpolate({
                  inputRange: [0, 0.04, 0.85, 1],
                  outputRange: [0, 1, 1, 0],
                }),
                transform: [
                  {
                    translateX: v.interpolate({
                      inputRange: ts,
                      outputRange: ts.map(
                        (t) => bez(from.x, cx, to.x, t) - SIZE / 2,
                      ),
                    }),
                  },
                  {
                    translateY: v.interpolate({
                      inputRange: ts,
                      outputRange: ts.map(
                        (t) => bez(from.y, cy, to.y, t) - SIZE / 2,
                      ),
                    }),
                  },
                  {
                    // Bursts out of the button at full size, settles to normal
                    // for the flight, then shrinks into the pill. The big first
                    // frame is what makes the star read as *coming from* the
                    // button rather than merely passing over it.
                    scale: v.interpolate({
                      inputRange: [0, 0.28, 0.8, 1],
                      outputRange: [2.1, 1, 1, 0.5],
                    }),
                  },
                  {
                    rotate: v.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0deg", "300deg"],
                    }),
                  },
                ],
              },
            ]}
          >
            <Ionicons name={icon} size={SIZE} color={theme.gold} />
          </Animated.View>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Window coords: this layer is mounted at the app root, outside the
  // SafeAreaView, so the maths matches what `measureInWindow` reports.
  layer: {
    ...StyleSheet.absoluteFillObject,
    ...overlayZ,
  },
  sprite: {
    position: "absolute",
    top: 0,
    left: 0,
  },
});
