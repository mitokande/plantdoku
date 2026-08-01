import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Image, StyleSheet, Text, View } from "react-native";

import { nextCard, RARITY_COLORS, type PlantCard } from "../game/cards";
import { PLANT_SOURCES } from "../game/plants";
import { formatTime } from "../format";
import { overlayZ, radius, scrim, shadow, space, theme, typography } from "../theme";
import { Button } from "./Button";
import { Confetti } from "./Confetti";
import { Tappable } from "./Tappable";

interface Props {
  level: number;
  seconds: number;
  /** Set when a daily puzzle was solved — switches title/stats. */
  daily?: { date: string; streak: number } | null;
  /** Set in endless mode — only changes the tag above the headline. */
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
  /** Coins this solve paid out. 0 on a replay, which shows no line at all. */
  coinsEarned?: number;
  /** Set when the solve reached a chest level — celebrated on its own line. */
  milestone?: { level: number; coins: number; hints: number } | null;
  /**
   * The card's only action: "Continue" leaves the board for Home. There is
   * deliberately no next-level / new-board shortcut here — the win card ends
   * the session on this board and Home is where the player picks the next one.
   */
  onMenu: () => void;
}

// The card-unlock reveal: silhouette holds, flips, full-colour plant lands —
// and that is the whole beat, nothing arrives after it. Tapping the backdrop
// skips straight to the end.
const REVEAL_DELAY = 320;
const REVEAL_MS = 620;

export function WinOverlay({
  level,
  seconds,
  daily,
  endless,
  stars,
  newCards = [],
  totalStars = 0,
  coinsEarned = 0,
  milestone = null,
  onMenu,
}: Props) {
  const wonCard = newCards[0] ?? null;
  // No card this solve, but level mode still tracks progress toward the next
  // one — null once the whole collection is unlocked.
  const upcoming = !wonCard && stars != null ? nextCard(totalStars) : null;
  const progress = upcoming ? Math.min(totalStars / upcoming.stars, 1) : 0;

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
  // Nothing renders off "the flip has finished" any more, so it is tracked in a
  // ref — a state flag here would re-render the card for no visible reason.
  const flip = useRef(new Animated.Value(0)).current;
  const revealed = useRef(false);
  useEffect(() => {
    if (!wonCard) return;
    const anim = Animated.timing(flip, {
      toValue: 1,
      delay: REVEAL_DELAY,
      duration: REVEAL_MS,
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (finished) revealed.current = true;
    });
    return () => anim.stop();
  }, [wonCard, flip]);

  /** Jump the reveal to its end — the reward beat must never be a wait. */
  const skipReveal = () => {
    if (!wonCard || revealed.current) return;
    flip.stopAnimation();
    flip.setValue(1);
    revealed.current = true;
  };

  const fade = enter.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  // The card's only sentence. It carries the context too, so nothing else has
  // to: the unlocked card if the solve earned one, else which board was solved.
  const title = wonCard
    ? `${wonCard.name} unlocked!`
    : daily
      ? "Daily solved!"
      : endless
        ? "Solved!"
        : `Level ${level} complete`;

  // Everything else is icon + number, never a sentence: time, streak, coins,
  // chest. A win card is a reward beat, not a receipt.
  const facts: { icon: keyof typeof Ionicons.glyphMap; value: string; gold?: boolean }[] = [
    { icon: "time-outline", value: formatTime(seconds) },
    ...(daily ? [{ icon: "flame" as const, value: `${daily.streak}` }] : []),
    ...(coinsEarned > 0
      ? [{ icon: "cash" as const, value: `+${coinsEarned}` }]
      : []),
    ...(milestone
      ? [{ icon: "gift" as const, value: `+${milestone.coins}`, gold: true }]
      : []),
    // The chest's hint half rides in as its own number, not folded into the
    // gift chip — they are different currencies and the row is icon+number.
    ...(milestone && milestone.hints > 0
      ? [{ icon: "bulb" as const, value: `+${milestone.hints}`, gold: true }]
      : []),
  ];

  return (
    <Animated.View style={[styles.backdrop, { opacity: fade }]}>
      <Confetti />
      {/* Tap anywhere to skip ahead to the end of the reveal. Silent: this is
          impatience, not a control, and it lands while the win jingle is still
          playing — a click on top of that just muddies the reward beat. */}
      <Tappable silent style={StyleSheet.absoluteFill} onPress={skipReveal} />
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
            {/* Nothing under the hero. The rarity + `N/17 collected` line used
                to land *after* the flip, so the card grew a line of text a beat
                late — a reward beat that twitches. The rarity is already in the
                glow and the frame, and the collection count lives on the Cards
                tab. */}
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
            {/* The bar alone. The "?" card above says what is being worked
                toward and the fill says how far along it is — the `★ 34/40`
                under it was the same fact spelled out. */}
          </View>
        ) : null}

        {stars && (
          <View style={styles.stars}>
            {[1, 2, 3].map((i) => (
              <Ionicons
                key={i}
                name={i <= stars.earned ? "star" : "star-outline"}
                size={30}
                color={i <= stars.earned ? theme.gold : theme.panelLine}
              />
            ))}
          </View>
        )}

        {/* One row of glanceable chips. The chest is the loud one — gold fill,
            because it is the payoff for a promise the Home path has been
            dangling for ten levels, not routine income. */}
        <View style={styles.facts}>
          {facts.map((f) => (
            <View key={f.icon} style={[styles.fact, f.gold && styles.factGold]}>
              <Ionicons
                name={f.icon}
                size={15}
                color={f.gold ? theme.onGold : theme.textDim}
              />
              <Text style={[styles.factTxt, f.gold && styles.factGoldTxt]}>
                {f.value}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <Button label="Continue" variant="solid" onPress={onMenu} flex />
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
  title: {
    ...typography.modalTitle,
    color: theme.text,
    textAlign: "center",
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
  stars: {
    flexDirection: "row",
    gap: space(1),
    marginTop: space(3),
  },
  facts: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: space(2),
    marginTop: space(3),
  },
  fact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: space(3),
    borderRadius: 999,
    backgroundColor: theme.bgAlt,
  },
  factTxt: {
    ...typography.caption,
    color: theme.text,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  factGold: {
    backgroundColor: theme.gold,
  },
  factGoldTxt: {
    color: theme.onGold,
  },
  actions: {
    flexDirection: "row",
    marginTop: space(4),
    alignSelf: "stretch",
  },
});
