import React, { useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { radius, theme } from "../theme";
import { Button } from "./Button";

// Spotlight rect in GameScreen-root coordinates. null = full blackout.
export interface Hole {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  hole: Hole | null;
  text: string;
  buttonLabel?: string; // when set, the stage advances via this button
  onButton?: () => void;
  checklist?: { label: string; done: boolean }[]; // progressive rule checklist
  // false suppresses the gold ring around multi-cell holes — the per-cell
  // hintCells outline already shows what matters, so a second ring around
  // the whole spotlight band would just read as "this entire rectangle is
  // important", which it isn't.
  holeRing?: boolean;
  pointer?: boolean; // bouncing finger under the hole (the plant stage)
}

// Dusk-tinted blackout — dark enough that nothing else competes for
// attention, with a hint of the garden green so it doesn't feel like a modal.
const SCRIM = "rgba(5, 12, 8, 0.85)";

// Every scrim rectangle claims its touches so nothing underneath (header,
// controls, board) can be reached — the hole is the only way in.
const block = { onStartShouldSetResponder: () => true } as const;

/** Bouncing 👆 under the spotlight, pointing at the cell to double-tap. */
function Pointer({ hole }: { hole: Hole }) {
  const bounce = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, {
          toValue: 1,
          duration: 380,
          useNativeDriver: true,
        }),
        Animated.timing(bounce, {
          toValue: 0,
          duration: 380,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bounce]);
  return (
    <Animated.Text
      pointerEvents="none"
      style={[
        styles.pointer,
        {
          left: hole.x + hole.w / 2 - 16,
          top: hole.y + hole.h + 4,
          transform: [
            {
              translateY: bounce.interpolate({
                inputRange: [0, 1],
                outputRange: [8, 0],
              }),
            },
          ],
        },
      ]}
    >
      👆
    </Animated.Text>
  );
}

/** Coach card — springs in whenever its text changes (re-keyed by text). */
function Card({
  text,
  buttonLabel,
  onButton,
  checklist,
}: Omit<Props, "hole" | "pointer" | "holeRing">) {
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, {
      toValue: 1,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [enter]);

  return (
    <Animated.View
      style={[
        styles.card,
        {
          opacity: enter,
          transform: [
            {
              translateY: enter.interpolate({
                inputRange: [0, 1],
                outputRange: [14, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Text style={styles.badge}>TUTORIAL</Text>
      {checklist && checklist.length > 0 && (
        <View style={styles.checklist}>
          {checklist.map((item) => (
            <View key={item.label} style={[styles.chip, item.done && styles.chipDone]}>
              <Text style={[styles.chipText, item.done && styles.chipTextDone]}>
                {item.done ? "✓ " : ""}
                {item.label}
              </Text>
            </View>
          ))}
        </View>
      )}
      <Text style={styles.text}>{text}</Text>
      {buttonLabel && onButton && (
        <View style={styles.btnRow}>
          <Button label={buttonLabel} variant="solid" onPress={onButton} />
        </View>
      )}
    </Animated.View>
  );
}

/**
 * First-play tutorial spotlight: blacks out the whole screen except `hole`,
 * swallowing every touch outside it, and shows one short instruction near
 * the hole (or centered when the blackout is total). The hole itself is an
 * absence of views, so touches there fall straight through to the Board.
 */
export function TutorialOverlay({
  hole,
  text,
  buttonLabel,
  onButton,
  checklist,
  holeRing = true,
  pointer,
}: Props) {
  const { height: winH } = useWindowDimensions();
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [fade]);

  // Card goes under the hole when the hole sits in the upper part of the
  // screen, above it otherwise; leave room for the pointer when shown.
  const cardBelow = hole ? hole.y + hole.h / 2 < winH * 0.55 : false;
  const cardSlot = hole
    ? cardBelow
      ? { top: hole.y + hole.h + (pointer ? 48 : 16) }
      : { bottom: winH - hole.y + 16 }
    : null;

  const card = (
    <Card
      key={text}
      text={text}
      buttonLabel={buttonLabel}
      onButton={onButton}
      checklist={checklist}
    />
  );

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, { opacity: fade }]}
    >
      {hole ? (
        <>
          <View {...block} style={[styles.scrim, { left: 0, right: 0, top: 0, height: Math.max(0, hole.y) }]} />
          <View {...block} style={[styles.scrim, { left: 0, top: hole.y, width: Math.max(0, hole.x), height: hole.h }]} />
          <View {...block} style={[styles.scrim, { left: hole.x + hole.w, right: 0, top: hole.y, height: hole.h }]} />
          <View {...block} style={[styles.scrim, { left: 0, right: 0, top: hole.y + hole.h, bottom: 0 }]} />
          {holeRing && (
            <View
              pointerEvents="none"
              style={[
                styles.holeRing,
                {
                  left: hole.x - 2,
                  top: hole.y - 2,
                  width: hole.w + 4,
                  height: hole.h + 4,
                },
              ]}
            />
          )}
          {pointer && <Pointer hole={hole} />}
          <View pointerEvents="box-none" style={[styles.cardSlot, cardSlot]}>
            {card}
          </View>
        </>
      ) : (
        <View {...block} style={[StyleSheet.absoluteFill, styles.scrim, styles.centerWrap]}>
          {card}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: "absolute",
    backgroundColor: SCRIM,
  },
  centerWrap: {
    justifyContent: "center",
  },
  holeRing: {
    position: "absolute",
    borderWidth: 2,
    borderColor: theme.gold,
    borderRadius: radius.sm + 4,
  },
  pointer: {
    position: "absolute",
    fontSize: 30,
  },
  cardSlot: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  card: {
    alignSelf: "center",
    width: "94%",
    maxWidth: 440,
    backgroundColor: theme.panel,
    borderColor: theme.accent,
    borderWidth: 2,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  badge: {
    color: theme.accent,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  checklist: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  chip: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: theme.bgAlt,
    borderWidth: 1,
    borderColor: theme.panelLine,
  },
  chipDone: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  chipText: {
    color: theme.textDim,
    fontSize: 10.5,
    fontWeight: "800",
  },
  chipTextDone: {
    color: theme.frame,
  },
  text: {
    color: theme.text,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "800",
    textAlign: "center",
  },
  btnRow: {
    marginTop: 10,
  },
});
