import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet } from "react-native";

import { overlayZ, theme } from "../theme";

export interface Pt {
  x: number;
  y: number;
}

interface Props {
  /** Window coords the stars fly from — the Home Play button. */
  from: Pt;
  /** Window coords they land on — the HUD star pill. */
  to: Pt;
  /** How many stars the solve earned (1..3). */
  count: number;
  /** Fired as each star lands, so the pill can pop under it. */
  onArrive?: () => void;
  onDone: () => void;
}

const STAR = 26;
const FLY_MS = 820;
const STAGGER = 155;
// Home's own entrance staggers its rows in; launching into that would look like
// the stars left before the button arrived.
const START_DELAY = 380;
// The arc is sampled into a polyline: Animated can only interpolate straight
// segments, and ~16 of them read as a curve at this size.
const SAMPLES = 16;

/**
 * The reward beat that pays a solve back to the wallet: stars arc from the Home
 * Play button up into the HUD star pill after a level win.
 *
 * It is purely cosmetic and non-blocking — `pointerEvents="none"`, no game
 * state, and the star total it is "delivering" has *already* been counted.
 * Nothing may ever wait on `onDone`.
 */
export function StarFlight({ from, to, count, onArrive, onDone }: Props) {
  const stars = useRef(
    Array.from({ length: count }, () => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    const anims = stars.map((v, i) =>
      Animated.timing(v, {
        toValue: 1,
        delay: START_DELAY + i * STAGGER,
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
      {stars.map((v, i) => {
        // One quadratic Bézier per star, bulging out to the right of the
        // straight line and fanned by index so three stars read as three paths
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
              styles.star,
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
                        (t) => bez(from.x, cx, to.x, t) - STAR / 2,
                      ),
                    }),
                  },
                  {
                    translateY: v.interpolate({
                      inputRange: ts,
                      outputRange: ts.map(
                        (t) => bez(from.y, cy, to.y, t) - STAR / 2,
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
            <Ionicons name="star" size={STAR} color={theme.gold} />
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
  star: {
    position: "absolute",
    top: 0,
    left: 0,
  },
});
