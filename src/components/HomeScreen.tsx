import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Image, Pressable, StyleSheet, Text, View } from "react-native";

import { CARDS, nextCard, RARITY_COLORS, unlockedCards } from "../game/cards";
import { PLANT_SOURCES } from "../game/plants";
import { LEVEL_COUNT } from "../game/levels";
import type { Difficulty } from "../game/types";
import { formatDateKey, formatTime } from "../format";
import { radius, shadow, space, theme, typography } from "../theme";

// The plants in the wordmark's garden bed (and, faded, behind the Endless
// lock). Purely decorative, picked for contrasting silhouettes and hues at
// ~50pt. Filtered through PLANT_SOURCES so a renamed/dropped id (the art
// rebuild binned three of the originals, which just rendered as gaps) can
// never silently thin the bed out again.
const DECO_PLANTS = ["sunflower", "toadstool", "tulip", "monstera", "lavender"]
  .filter((id) => PLANT_SOURCES[id]);

/** The saved mid-solve board behind the Continue button (see useGame.resume). */
export interface ResumeInfo {
  mode: "level" | "daily" | "endless";
  level: number;
  dailyKey: string | null;
  difficulty: Difficulty | null;
  placed: number;
  size: number;
  seconds: number;
  hearts: number;
}

interface Props {
  unlockedLevel: number;
  allComplete: boolean;
  totalStars: number;
  /** An unfinished board waiting to be picked up, if there is one. */
  resume: ResumeInfo | null;
  onResume: () => void;
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

const DIFF_LABEL: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

/** What the Continue card calls the board it saved. */
function resumeLabel(r: ResumeInfo): string {
  if (r.mode === "daily") {
    return r.dailyKey ? `Daily ${formatDateKey(r.dailyKey)}` : "Daily puzzle";
  }
  if (r.mode === "endless") {
    return `Endless · ${r.difficulty ? DIFF_LABEL[r.difficulty] : ""}`.trim();
  }
  return `Level ${r.level}`;
}

export function HomeScreen({
  unlockedLevel,
  allComplete,
  totalStars,
  resume,
  onResume,
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
        {/* Wordmark on a planted bed: the sprites overlap and sit *in* a mound
            of soil instead of floating as a detached row of icons. */}
        <Rise delay={0}>
          <View style={styles.logo}>
            <View style={styles.bed}>
              {DECO_PLANTS.map((id, i) => (
                <Image
                  key={id}
                  source={PLANT_SOURCES[id]}
                  style={[
                    styles.bedPlant,
                    {
                      // Staggered heights + slight lean, so the bed reads as
                      // planted rather than as a row of stamps.
                      marginBottom: i % 2 === 0 ? 6 : 0,
                      transform: [{ rotate: `${(i - 2) * 4}deg` }],
                      zIndex: i % 2 === 0 ? 2 : 1,
                    },
                  ]}
                />
              ))}
            </View>
            <View style={styles.mound} />
          </View>
          <Text style={styles.title}>Plantdoku</Text>
        </Rise>

        {/* ONE primary action. A saved board is what the player wants next, so
            it *is* the button — with its progress on the face — rather than a
            second card competing with PLAY for the same tap. */}
        <Rise delay={120}>
          {allComplete && !resume ? (
            <View style={styles.doneCard}>
              <Ionicons name="trophy" size={36} color={theme.gold} />
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
                      outputRange: [1, 1.02],
                    }),
                  },
                ],
              }}
            >
              <Pressable
                onPress={resume ? onResume : onPlay}
                accessibilityRole="button"
                style={styles.playEdge}
              >
                {({ pressed }) => (
                  <View style={[styles.play, pressed && styles.playPressed]}>
                    <View style={styles.playRow}>
                      <Ionicons name="leaf" size={22} color={theme.onAccent} />
                      <Text style={styles.playLabel}>
                        {resume ? "Continue" : "Play"}
                      </Text>
                    </View>
                    <Text style={styles.playSub}>
                      {resume
                        ? `${resumeLabel(resume)} · ${resume.placed}/${
                            resume.size
                          } planted · ${formatTime(resume.seconds)}`
                        : `Level ${unlockedLevel} / ${LEVEL_COUNT}`}
                    </Text>
                  </View>
                )}
              </Pressable>
            </Animated.View>
          )}
        </Rise>

        {/* The one case where a second entry point earns its place: the saved
            board is a daily or an endless run, so the level ladder would
            otherwise be unreachable from this screen. Deliberately a quiet
            link, not a peer of the button above. */}
        {resume && resume.mode !== "level" && !allComplete && (
          <Rise delay={180}>
            <Pressable onPress={onPlay} hitSlop={6} style={styles.altLink}>
              <Text style={styles.altLinkTxt}>
                {`Play level ${unlockedLevel} of ${LEVEL_COUNT}`}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={theme.textDim} />
            </Pressable>
          </Rise>
        )}

        {/* Card collection showcase — the meta lives front and center. */}
        <Rise delay={220}>
          <Pressable onPress={onCards} style={styles.cardsPanel}>
            <View style={styles.cardsHeader}>
              <Text style={styles.cardsTitle}>Plant collection</Text>
              <Text style={styles.cardsCount}>
                {collected.length} of {CARDS.length}
              </Text>
            </View>

            {/* The cards themselves are the point — they get the room, and the
                next one sits among them as a face-down slot. */}
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
              <Ionicons name="chevron-forward" size={20} color={theme.textDim} />
            </View>

            {upcoming ? (
              <>
                <View style={styles.barTrack}>
                  <View
                    style={[styles.barFill, { width: `${progress * 100}%` }]}
                  />
                </View>
                <Text style={styles.barLabel}>
                  <Ionicons name="star" size={12} color={theme.gold} />
                  {`  ${totalStars}/${upcoming.stars} — next up: ${upcoming.name}`}
                </Text>
              </>
            ) : (
              <Text style={styles.barLabel}>
                All {CARDS.length} cards collected!
              </Text>
            )}
          </Pressable>
        </Rise>

        <Rise delay={320}>
          {unlockedLevel >= ENDLESS_UNLOCK_LEVEL ? (
            <View style={styles.endless}>
              <View style={styles.endlessTitleRow}>
                <Ionicons name="leaf" size={16} color={theme.accent} />
                <Text style={styles.endlessTitle}>Endless garden</Text>
              </View>
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
            // Locked, but still desirable: the garden stays visible behind the
            // lock and the card shows how close the player is.
            <View style={[styles.endless, styles.endlessLocked]}>
              <View pointerEvents="none" style={styles.lockedGarden}>
                {DECO_PLANTS.map((id) => (
                  <Image
                    key={id}
                    source={PLANT_SOURCES[id]}
                    style={styles.lockedGardenImg}
                  />
                ))}
              </View>
              <View style={styles.endlessLockedRow}>
                <Ionicons name="lock-closed" size={20} color={theme.textDim} />
                <View style={styles.topSpacer}>
                  <Text style={styles.endlessTitle}>Endless garden</Text>
                  <Text style={styles.endlessLockedSub}>
                    Unlock at level {ENDLESS_UNLOCK_LEVEL}
                  </Text>
                </View>
                <Text style={styles.endlessLockedCount}>
                  {Math.min(unlockedLevel, ENDLESS_UNLOCK_LEVEL)} /{" "}
                  {ENDLESS_UNLOCK_LEVEL}
                </Text>
              </View>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    styles.lockedBarFill,
                    {
                      width: `${
                        Math.min(unlockedLevel / ENDLESS_UNLOCK_LEVEL, 1) * 100
                      }%`,
                    },
                  ]}
                />
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
  // Branding sits high on the screen rather than floating in the middle of a
  // tall empty column.
  content: {
    flex: 1,
    justifyContent: "flex-start",
    paddingTop: space(3),
  },
  logo: {
    alignItems: "center",
    marginBottom: space(1),
  },
  bed: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  bedPlant: {
    width: 52,
    height: 52,
    marginHorizontal: -6,
    resizeMode: "contain",
  },
  // The soil the plants stand in — ties the sprites into one object.
  mound: {
    width: 176,
    height: 13,
    marginTop: -5,
    borderRadius: 999,
    backgroundColor: theme.soil,
    opacity: 0.85,
  },
  title: {
    ...typography.screenTitle,
    color: theme.text,
    textAlign: "center",
    marginBottom: space(5),
  },
  playEdge: {
    ...CARD_W,
    borderRadius: radius.btn,
    backgroundColor: theme.accentDark,
    ...shadow.raised,
  },
  play: {
    alignItems: "center",
    backgroundColor: theme.accent,
    paddingVertical: space(4),
    borderRadius: radius.btn,
    marginBottom: EDGE,
  },
  playPressed: {
    marginTop: EDGE,
    marginBottom: 0,
  },
  playRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
  },
  playLabel: {
    color: theme.onAccent,
    fontSize: 26,
    fontWeight: "900",
  },
  playSub: {
    ...typography.caption,
    color: theme.onAccent,
    opacity: 0.8,
    marginTop: 3,
    fontVariant: ["tabular-nums"],
  },
  altLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: space(2),
    paddingVertical: space(2),
  },
  altLinkTxt: {
    ...typography.caption,
    color: theme.textDim,
  },
  doneCard: {
    ...CARD_W,
    alignItems: "center",
    backgroundColor: theme.panel,
    borderRadius: radius.lg,
    paddingVertical: space(6),
    ...shadow.card,
  },
  doneTitle: {
    ...typography.cardTitle,
    color: theme.text,
    marginTop: space(2),
  },
  doneSub: {
    ...typography.caption,
    color: theme.textDim,
    marginTop: 2,
  },
  // A plain white card with a soft shadow: gold is for rewards, not for
  // outlining ordinary panels.
  cardsPanel: {
    ...CARD_W,
    marginTop: space(6),
    paddingVertical: space(4),
    paddingHorizontal: space(4),
    backgroundColor: theme.panel,
    borderRadius: radius.lg,
    ...shadow.card,
  },
  cardsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space(3),
  },
  cardsTitle: {
    ...typography.cardTitle,
    fontSize: 17,
    color: theme.text,
  },
  cardsCount: {
    ...typography.caption,
    color: theme.textDim,
  },
  cardsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(2),
  },
  mini: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.bgAlt,
    borderRadius: radius.chip,
    borderWidth: 1.5,
  },
  miniLocked: {
    borderColor: theme.panelLine,
    borderStyle: "dashed",
  },
  miniImg: {
    width: 38,
    height: 38,
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
    height: 8,
    borderRadius: 999,
    backgroundColor: theme.bgAlt,
    marginTop: space(3),
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: theme.gold,
  },
  lockedBarFill: {
    backgroundColor: theme.accent,
  },
  barLabel: {
    ...typography.caption,
    color: theme.textDim,
    marginTop: space(2),
  },
  endless: {
    ...CARD_W,
    marginTop: space(3),
    paddingVertical: space(3),
    paddingHorizontal: space(4),
    backgroundColor: theme.panel,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...shadow.card,
  },
  endlessTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: space(2),
  },
  endlessTitle: {
    ...typography.cardTitle,
    fontSize: 16,
    color: theme.text,
  },
  endlessChips: {
    flexDirection: "row",
    gap: space(2),
  },
  endlessLocked: {
    backgroundColor: theme.bgAlt,
  },
  // The garden behind the lock: visible enough to want, faint enough to read
  // as not-yet-yours.
  lockedGarden: {
    position: "absolute",
    right: -6,
    bottom: -10,
    flexDirection: "row",
    alignItems: "flex-end",
    opacity: 0.3,
  },
  lockedGardenImg: {
    width: 54,
    height: 54,
    marginHorizontal: -8,
    resizeMode: "contain",
  },
  endlessLockedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space(3),
  },
  endlessLockedSub: {
    ...typography.caption,
    color: theme.textDim,
    marginTop: 1,
  },
  endlessLockedCount: {
    ...typography.caption,
    color: theme.textDim,
    fontVariant: ["tabular-nums"],
  },
  chip: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingVertical: space(2),
    borderRadius: radius.chip,
    backgroundColor: theme.bgAlt,
    borderWidth: 1,
    borderColor: theme.panelLine,
  },
  chipPressed: {
    backgroundColor: theme.panelLine,
  },
  chipTxt: {
    ...typography.caption,
    fontSize: 14.5,
    color: theme.text,
  },
});
