import React, { useEffect, useRef } from "react";
import { Animated, Image, Pressable, StyleSheet, Text, View } from "react-native";

import { CARDS, nextCard, RARITY_COLORS, unlockedCards } from "../game/cards";
import { PLANT_SOURCES } from "../game/plants";
import { LEVEL_COUNT } from "../game/levels";
import type { Difficulty } from "../game/types";
import { radius, theme } from "../theme";

interface Props {
  unlockedLevel: number;
  allComplete: boolean;
  totalStars: number;
  onPlay: () => void;
  onEndless: (difficulty: Difficulty) => void;
  /** Jump to the Cards tab (showcase panel tap-through). */
  onCards: () => void;
}

const ENDLESS_CHIPS: { difficulty: Difficulty; label: string }[] = [
  { difficulty: "easy", label: "Easy" },
  { difficulty: "medium", label: "Medium" },
  { difficulty: "hard", label: "Hard" },
];

// Play button "3D" bottom-edge height (matches the Button treatment).
const EDGE = 5;

// Endless mode stays locked until the player has reached this level.
const ENDLESS_UNLOCK_LEVEL = 15;

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

export function HomeScreen({
  unlockedLevel,
  allComplete,
  totalStars,
  onPlay,
  onEndless,
  onCards,
}: Props) {
  const collected = unlockedCards(totalStars);
  const upcoming = nextCard(totalStars);
  // The showcase strip: latest unlocks + the next card as a face-down teaser.
  const recent = collected.slice(-4);
  const progress = upcoming ? Math.min(totalStars / upcoming.stars, 1) : 1;

  // Idle "breathing" pulse on the Play button — hybrid-casual CTA juice.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 750,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.wrap}>
      <View style={styles.content}>
        <Rise delay={0}>
          <View style={styles.deco}>
            {["sunflower", "cactus", "cherries", "lotus", "bluebell"].map((id) => (
              <Image key={id} source={PLANT_SOURCES[id]} style={styles.decoImg} />
            ))}
          </View>
          <Text style={styles.title}>Plantdoku</Text>
        </Rise>

        <Rise delay={120}>
          {allComplete ? (
            <View style={styles.doneCard}>
              <Text style={styles.doneEmoji}>🌻</Text>
              <Text style={styles.doneTitle}>All levels complete!</Text>
              <Text style={styles.doneSub}>More levels coming soon.</Text>
            </View>
          ) : (
            <Animated.View
              style={{
                transform: [
                  {
                    scale: pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.03],
                    }),
                  },
                ],
              }}
            >
              <Pressable onPress={onPlay} style={styles.playEdge}>
                {({ pressed }) => (
                  <View style={[styles.play, pressed && styles.playPressed]}>
                    <Text style={styles.playLabel}>PLAY</Text>
                    <Text style={styles.playSub}>
                      Level {unlockedLevel} / {LEVEL_COUNT}
                    </Text>
                  </View>
                )}
              </Pressable>
            </Animated.View>
          )}
        </Rise>

        {/* Card collection showcase — the meta lives front and center. */}
        <Rise delay={220}>
          <Pressable onPress={onCards} style={styles.cardsPanel}>
            <View style={styles.cardsHeader}>
              <Text style={styles.cardsTitle}>🃏 PLANT CARDS</Text>
              <View style={styles.cardsBadge}>
                <Text style={styles.cardsBadgeTxt}>
                  {collected.length}/{CARDS.length}
                </Text>
              </View>
            </View>

            <View style={styles.cardsRow}>
              {recent.map((c) => (
                <View
                  key={c.plantId}
                  style={[styles.mini, { borderColor: RARITY_COLORS[c.rarity] }]}
                >
                  <Image
                    source={PLANT_SOURCES[c.plantId]}
                    style={styles.miniImg}
                  />
                </View>
              ))}
              {upcoming && (
                <View style={[styles.mini, styles.miniLocked]}>
                  <Image
                    source={PLANT_SOURCES[upcoming.plantId]}
                    style={[styles.miniImg, styles.miniImgLocked]}
                  />
                  <Text style={styles.miniQ}>?</Text>
                </View>
              )}
              <View style={styles.topSpacer} />
              <Text style={styles.chevron}>›</Text>
            </View>

            {upcoming ? (
              <>
                <View style={styles.barTrack}>
                  <View
                    style={[styles.barFill, { width: `${progress * 100}%` }]}
                  />
                </View>
                <Text style={styles.barLabel}>
                  ★ {totalStars}/{upcoming.stars}
                  {collected.length === 0
                    ? " — solve levels to collect your first card!"
                    : " to your next card"}
                </Text>
              </>
            ) : (
              <Text style={styles.barLabel}>
                All {CARDS.length} cards collected! 🌻
              </Text>
            )}
          </Pressable>
        </Rise>

        <Rise delay={320}>
          {unlockedLevel >= ENDLESS_UNLOCK_LEVEL ? (
            <View style={styles.endless}>
              <Text style={styles.endlessTitle}>🌿 Endless garden</Text>
              <View style={styles.endlessChips}>
                {ENDLESS_CHIPS.map(({ difficulty, label }) => (
                  <Pressable
                    key={difficulty}
                    onPress={() => onEndless(difficulty)}
                    style={({ pressed }) => [
                      styles.chip,
                      pressed && styles.chipPressed,
                    ]}
                  >
                    <Text style={styles.chipTxt}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <View style={[styles.endless, styles.endlessLocked]}>
              <View style={styles.endlessLockedRow}>
                <Text style={styles.endlessLockIcon}>🔒</Text>
                <View>
                  <Text style={styles.endlessLockedTitle}>Endless garden</Text>
                  <Text style={styles.endlessLockedSub}>
                    Reach level {ENDLESS_UNLOCK_LEVEL} to unlock
                  </Text>
                </View>
              </View>
            </View>
          )}
        </Rise>
      </View>
    </View>
  );
}

const CARD_W = { alignSelf: "center" as const, width: "92%" as const, maxWidth: 340 };

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: 20,
  },
  topSpacer: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
  },
  deco: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 4,
  },
  decoImg: {
    width: 50,
    height: 50,
    marginHorizontal: -2,
    resizeMode: "contain",
  },
  title: {
    color: theme.text,
    fontSize: 42,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 0.5,
    marginBottom: 22,
  },
  playEdge: {
    ...CARD_W,
    borderRadius: radius.lg,
    backgroundColor: theme.accentDark,
  },
  play: {
    alignItems: "center",
    backgroundColor: theme.accent,
    paddingVertical: 20,
    borderRadius: radius.lg,
    marginBottom: EDGE,
  },
  playPressed: {
    marginTop: EDGE,
    marginBottom: 0,
  },
  playLabel: {
    color: "#0E2110",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 2,
  },
  playSub: {
    color: "#0E2110",
    fontSize: 14,
    fontWeight: "800",
    opacity: 0.75,
    marginTop: 2,
  },
  doneCard: {
    ...CARD_W,
    alignItems: "center",
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
  cardsPanel: {
    ...CARD_W,
    marginTop: 16,
    paddingVertical: 13,
    paddingHorizontal: 15,
    backgroundColor: theme.panel,
    borderColor: theme.gold,
    borderWidth: 1.5,
    borderRadius: radius.lg,
  },
  cardsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  cardsTitle: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1,
  },
  cardsBadge: {
    backgroundColor: theme.gold,
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 9,
  },
  cardsBadgeTxt: {
    color: "#0E2110",
    fontSize: 12.5,
    fontWeight: "900",
  },
  cardsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  mini: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.bgAlt,
    borderRadius: radius.sm,
    borderWidth: 1.5,
  },
  miniLocked: {
    borderColor: theme.panelLine,
    backgroundColor: theme.bg,
  },
  miniImg: {
    width: 36,
    height: 36,
    resizeMode: "contain",
  },
  miniImgLocked: {
    tintColor: theme.frame,
    opacity: 0.9,
  },
  miniQ: {
    position: "absolute",
    color: theme.gold,
    fontSize: 19,
    fontWeight: "900",
  },
  barTrack: {
    height: 9,
    borderRadius: 999,
    backgroundColor: theme.bg,
    marginTop: 11,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: theme.gold,
  },
  barLabel: {
    color: theme.textDim,
    fontSize: 12.5,
    fontWeight: "700",
    marginTop: 6,
  },
  chevron: {
    color: theme.textDim,
    fontSize: 24,
    fontWeight: "700",
  },
  endless: {
    ...CARD_W,
    marginTop: 12,
    paddingVertical: 11,
    paddingHorizontal: 15,
    backgroundColor: theme.panel,
    borderColor: theme.panelLine,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  endlessTitle: {
    color: theme.text,
    fontSize: 15.5,
    fontWeight: "800",
    marginBottom: 9,
  },
  endlessChips: {
    flexDirection: "row",
    gap: 8,
  },
  endlessLocked: {
    backgroundColor: theme.bgAlt,
    opacity: 0.75,
  },
  endlessLockedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  endlessLockIcon: {
    fontSize: 22,
  },
  endlessLockedTitle: {
    color: theme.textDim,
    fontSize: 15.5,
    fontWeight: "800",
  },
  endlessLockedSub: {
    color: theme.textDim,
    fontSize: 12.5,
    marginTop: 1,
  },
  chip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: theme.bgAlt,
    borderWidth: 1,
    borderColor: theme.panelLine,
  },
  chipPressed: {
    backgroundColor: theme.panelLine,
  },
  chipTxt: {
    color: theme.text,
    fontSize: 14,
    fontWeight: "800",
  },
});
