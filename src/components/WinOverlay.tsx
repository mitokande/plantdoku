import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Image, Pressable, StyleSheet, Text, View } from "react-native";

import {
  CARDS,
  nextCard,
  RARITY_COLORS,
  unlockedCards,
  type PlantCard,
} from "../game/cards";
import { PLANT_SOURCES } from "../game/plants";
import { formatTime } from "../format";
import { overlayZ, radius, scrim, shadow, space, theme, typography } from "../theme";
import { Button } from "./Button";
import { Confetti } from "./Confetti";

interface Props {
  level: number;
  seconds: number;
  hasNext: boolean;
  /** Set when a daily puzzle was solved — switches title/stats/actions. */
  daily?: { date: string; streak: number } | null;
  /** Set in endless mode — "Continue" becomes "New board". */
  endless?: boolean;
  /**
   * Level-mode star rating for this solve. `hintsUsed` is here so the card can
   * show *which* goals were met rather than a bare count — `starsFor` is
   * 1 (solved) + no-hints + under-par, so those three lines are the rating.
   */
  stars?: { earned: number; par: number; hintsUsed: number } | null;
  /** Plant cards unlocked by this solve (level mode only). */
  newCards?: PlantCard[];
  /** Total stars across all levels — drives the next-card progress bar. */
  totalStars?: number;
  onShare?: () => void;
  onNext: () => void;
  onMenu: () => void;
}

// The card-unlock reveal: silhouette holds, flips, full-colour plant lands,
// then the name. Tapping the backdrop skips straight to the end.
const REVEAL_DELAY = 320;
const REVEAL_MS = 620;

export function WinOverlay({
  level,
  seconds,
  hasNext,
  daily,
  endless,
  stars,
  newCards = [],
  totalStars = 0,
  onShare,
  onNext,
  onMenu,
}: Props) {
  const wonCard = newCards[0] ?? null;
  // No card this solve, but level mode still tracks progress toward the next
  // one — null once the whole collection is unlocked.
  const upcoming = !wonCard && stars != null ? nextCard(totalStars) : null;
  const progress = upcoming ? Math.min(totalStars / upcoming.stars, 1) : 0;
  const collected = unlockedCards(totalStars).length;

  // Springy entrance: backdrop fades while the card scales up with overshoot.
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, {
      toValue: 1,
      friction: 6,
      tension: 70,
      useNativeDriver: true,
    }).start();
  }, [enter]);

  // The won card is the hero: it flips from face-down silhouette to the plant.
  const flip = useRef(new Animated.Value(0)).current;
  const [named, setNamed] = useState(false);
  useEffect(() => {
    if (!wonCard) return;
    const anim = Animated.timing(flip, {
      toValue: 1,
      delay: REVEAL_DELAY,
      duration: REVEAL_MS,
      useNativeDriver: true,
    });
    anim.start(({ finished }) => finished && setNamed(true));
    return () => anim.stop();
  }, [wonCard, flip]);

  /** Jump the reveal to its end — the reward beat must never be a wait. */
  const skipReveal = () => {
    if (!wonCard || named) return;
    flip.stopAnimation();
    flip.setValue(1);
    setNamed(true);
  };

  const fade = enter.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const tag = daily
    ? `Daily · ${daily.date}`
    : endless
      ? "Endless"
      : `Level ${level} complete`;

  // One headline: the card if this solve earned one, otherwise the solve.
  const title = wonCard ? `${wonCard.name} unlocked!` : "Solved!";

  const goals = stars
    ? [
        { label: "Puzzle solved", done: true },
        { label: "No hints used", done: stars.hintsUsed === 0 },
        { label: `Finish under ${formatTime(stars.par)}`, done: seconds <= stars.par },
      ]
    : [];

  return (
    <Animated.View style={[styles.backdrop, { opacity: fade }]}>
      <Confetti />
      {/* Tap anywhere to skip ahead to the end of the reveal. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={skipReveal} />
      <Animated.View
        style={[
          styles.card,
          {
            transform: [
              {
                scale: enter.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.7, 1],
                }),
              },
            ],
          },
        ]}
      >
        <Text style={styles.tag}>{tag}</Text>
        <Text style={styles.title}>{title}</Text>

        {wonCard ? (
          <View style={styles.hero}>
            <View style={styles.heroFrameWrap}>
              <Animated.View
                style={[
                  styles.heroGlow,
                  {
                    backgroundColor: RARITY_COLORS[wonCard.rarity],
                    opacity: flip.interpolate({
                      inputRange: [0.5, 1],
                      outputRange: [0, 0.35],
                      extrapolate: "clamp",
                    }),
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.heroFrame,
                  {
                    borderColor: RARITY_COLORS[wonCard.rarity],
                    transform: [
                      {
                        // |cos|-ish flip: the frame squashes to nothing at the
                        // halfway point, which is where the faces swap.
                        scaleX: flip.interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: [1, 0.04, 1],
                        }),
                      },
                      {
                        scale: flip.interpolate({
                          inputRange: [0, 0.5, 0.8, 1],
                          outputRange: [1, 1, 1.1, 1],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <Animated.Image
                  source={PLANT_SOURCES[wonCard.plantId]}
                  style={[
                    styles.heroImg,
                    styles.lockedImg,
                    styles.heroFace,
                    {
                      opacity: flip.interpolate({
                        inputRange: [0, 0.49, 0.5],
                        outputRange: [1, 1, 0],
                      }),
                    },
                  ]}
                />
                <Animated.Image
                  source={PLANT_SOURCES[wonCard.plantId]}
                  style={[
                    styles.heroImg,
                    styles.heroFace,
                    {
                      opacity: flip.interpolate({
                        inputRange: [0.5, 0.51, 1],
                        outputRange: [0, 1, 1],
                      }),
                    },
                  ]}
                />
              </Animated.View>
            </View>
            {named && (
              <Text style={styles.heroMeta}>
                <Text style={{ color: RARITY_COLORS[wonCard.rarity] }}>
                  {wonCard.rarity}
                </Text>
                {`  ·  ${collected}/${CARDS.length} collected`}
                {newCards.length > 1 ? `  ·  +${newCards.length - 1} more` : ""}
              </Text>
            )}
          </View>
        ) : upcoming ? (
          <View style={styles.progressWrap}>
            <View style={styles.heroFrameWrap}>
              <View style={[styles.heroFrame, styles.lockedFrame]}>
                <Image
                  source={PLANT_SOURCES[upcoming.plantId]}
                  style={[styles.heroImg, styles.lockedImg]}
                />
                <Text style={styles.lockedQ}>?</Text>
              </View>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
            </View>
            <Text style={styles.barLabel}>
              <Ionicons name="star" size={12} color={theme.gold} />
              {`  ${totalStars}/${upcoming.stars} to unlock ${upcoming.name}`}
            </Text>
          </View>
        ) : null}

        {stars && (
          <>
            <View style={styles.stars}>
              {[1, 2, 3].map((i) => (
                <Ionicons
                  key={i}
                  name={i <= stars.earned ? "star" : "star-outline"}
                  size={28}
                  color={i <= stars.earned ? theme.gold : theme.panelLine}
                />
              ))}
            </View>
            {stars.earned < 3 && (
              <View style={styles.goals}>
                {goals.map((g) => (
                  <View key={g.label} style={styles.goalRow}>
                    <Ionicons
                      name={g.done ? "star" : "star-outline"}
                      size={13}
                      color={g.done ? theme.gold : theme.panelLine}
                    />
                    <Text style={[styles.goalTxt, g.done && styles.goalDone]}>
                      {g.label}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        <Text style={styles.timeLine}>
          {`Solved in ${formatTime(seconds)}`}
          {daily ? `  ·  🔥 ${daily.streak}` : ""}
        </Text>

        <View style={styles.actions}>
          {daily ? (
            <Button
              label="Share"
              icon="share-outline"
              variant="solid"
              onPress={onShare ?? (() => {})}
              flex
            />
          ) : endless ? (
            <Button
              label="New board"
              variant="solid"
              onPress={onNext}
              flex
            />
          ) : hasNext ? (
            <Button label="Continue" variant="solid" onPress={onNext} flex />
          ) : null}
        </View>
        {!daily && !endless && (
          <Text style={styles.nextLine}>
            {hasNext ? `Next: Level ${level + 1}` : "More levels coming soon"}
          </Text>
        )}

        <Pressable
          onPress={onMenu}
          hitSlop={8}
          accessibilityRole="button"
          style={styles.menuLink}
        >
          <Text style={styles.menuTxt}>Menu</Text>
        </Pressable>
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
    ...overlayZ,
    backgroundColor: scrim,
    alignItems: "center",
    justifyContent: "center",
    padding: space(6),
  },
  card: {
    width: "100%",
    maxWidth: 330,
    backgroundColor: theme.panel,
    borderRadius: radius.modal,
    paddingVertical: space(5),
    paddingHorizontal: space(5),
    alignItems: "center",
    ...shadow.modal,
  },
  tag: {
    ...typography.overline,
    color: theme.textDim,
    textTransform: "uppercase",
  },
  title: {
    ...typography.modalTitle,
    color: theme.text,
    textAlign: "center",
    marginTop: 2,
  },
  hero: {
    alignItems: "center",
    marginTop: space(2),
  },
  heroFrameWrap: {
    width: 124,
    height: 124,
    alignItems: "center",
    justifyContent: "center",
  },
  heroGlow: {
    position: "absolute",
    width: 124,
    height: 124,
    borderRadius: 62,
  },
  heroFrame: {
    width: 104,
    height: 104,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.bgAlt,
    borderRadius: radius.md,
    borderWidth: 2.5,
  },
  heroImg: {
    width: 80,
    height: 80,
    resizeMode: "contain",
  },
  // Both faces of the flip stack in the same spot.
  heroFace: {
    position: "absolute",
  },
  heroMeta: {
    ...typography.caption,
    color: theme.textDim,
    marginTop: space(2),
    textTransform: "capitalize",
  },
  progressWrap: {
    alignSelf: "stretch",
    alignItems: "center",
    marginTop: space(2),
  },
  lockedFrame: {
    borderColor: theme.panelLine,
  },
  lockedImg: {
    tintColor: theme.frame,
    opacity: 0.9,
  },
  lockedQ: {
    position: "absolute",
    color: theme.gold,
    fontSize: 30,
    fontWeight: "900",
  },
  barTrack: {
    alignSelf: "stretch",
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.bgAlt,
    marginTop: space(3),
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: theme.gold,
  },
  barLabel: {
    ...typography.caption,
    color: theme.textDim,
    marginTop: space(2),
  },
  stars: {
    flexDirection: "row",
    gap: space(1),
    marginTop: space(3),
  },
  goals: {
    marginTop: space(2),
    gap: 3,
  },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  goalTxt: {
    ...typography.caption,
    color: theme.textDim,
  },
  goalDone: {
    color: theme.text,
  },
  timeLine: {
    ...typography.caption,
    color: theme.textDim,
    fontVariant: ["tabular-nums"],
    marginTop: space(3),
  },
  actions: {
    flexDirection: "row",
    marginTop: space(4),
    alignSelf: "stretch",
  },
  nextLine: {
    ...typography.caption,
    color: theme.textDim,
    marginTop: space(1),
  },
  menuLink: {
    marginTop: space(3),
    paddingVertical: space(1),
    paddingHorizontal: space(4),
  },
  menuTxt: {
    ...typography.caption,
    color: theme.textDim,
    textDecorationLine: "underline",
  },
});
