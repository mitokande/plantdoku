// Push / local-notification wrapper. The rest of the app calls into this typed
// facade rather than touching expo-notifications directly, so there is one place
// to manage the reminder taxonomy, permission flow, Android channel, and the
// graceful no-op behaviour.
//
// NOTE: this module imports expo-notifications / expo-device (RN-only). Keep it
// out of `src/game/*` so the headless Node tests stay framework-free (same rule
// as `src/analytics` and `src/audio`).
//
// Behaviour mirrors the audio facade: native-only, every call is a safe no-op on
// web / before init, and all failures are swallowed — notifications can never
// break gameplay. Two kinds live here:
//
//   • LOCAL reminders (no backend): scheduled on-device from the player's own
//     progress. `sync(plan)` cancels the whole reminder set and reschedules it
//     from the current game state, so it stays correct as the player advances.
//   • REMOTE push (optional backend): `registerForPush()` returns the Expo push
//     token. We have no server yet, so the token is just exposed/logged — a
//     future backend would store it and send "new levels / new card" campaigns
//     (see PUSH_PAYLOAD below for the contract).

import { Platform } from "react-native";

import type * as Notifications from "expo-notifications";

// expo-notifications targets native; on web we no-op (the web build is a
// smoke-test target only, and the browser has no scheduler to manage).
const enabled = Platform.OS !== "web";

let mod: typeof import("expo-notifications") | null = null;
let device: typeof import("expo-device") | null = null;
if (enabled) {
  // Loaded lazily so web builds don't pull in the native modules.
  try {
    mod = require("expo-notifications");
    device = require("expo-device");
  } catch {
    mod = null;
    device = null;
  }
}

// Stable identifiers so a reschedule replaces (never duplicates) a reminder.
const CHANNEL_ID = "reminders";

/** A snapshot of the player's progress that the reminder copy/timing derives
 *  from. Built by useGame; this module never reads game state directly. */
export interface ReminderPlan {
  /** Master switch — false cancels everything. */
  enabled: boolean;
  /** Whether today's daily puzzle is already solved (skips the streak nudge). */
  dailyDoneToday: boolean;
  /** Current daily streak length (for "don't lose your N-day streak"). */
  streak: number;
  /** Stars until the next plant card unlocks, if any (re-engage flavour). */
  starsToNextCard?: number;
}

const MORNING_HOUR = 10; // "today's daily is ready"
const EVENING_HOUR = 20; // "you still have time to keep your streak"

/** The remote-push payload a future backend would send. Documented here so the
 *  client and server stay in sync; `registerForPush` is the client half. */
export interface PushPayload {
  kind: "new_levels" | "new_card" | "announcement";
  title: string;
  body: string;
}

let configured = false;

async function configure(): Promise<void> {
  if (!mod || configured) return;
  configured = true;
  try {
    // Foreground presentation: show the banner even while the app is open.
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === "android") {
      await mod.setNotificationChannelAsync(CHANNEL_ID, {
        name: "Reminders",
        importance: mod.AndroidImportance.DEFAULT,
        sound: undefined,
      });
    }
  } catch {}
}

/** Next clock time at `hour:00` strictly in the future (today if not yet past,
 *  otherwise tomorrow). Local time, so it tracks the player's wall clock. */
function nextAt(hour: number): Date {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

async function schedule(
  mod: typeof import("expo-notifications"),
  identifier: string,
  title: string,
  body: string,
  trigger: Notifications.NotificationTriggerInput,
): Promise<void> {
  await mod.scheduleNotificationAsync({
    identifier,
    content: { title, body },
    trigger,
  });
}

let pushToken: string | null = null;

export const notifications = {
  /** True when notifications can be scheduled (native, module loaded). */
  enabled: enabled && !!mod,

  /** Current OS permission status without prompting. */
  async getPermissionStatus(): Promise<
    "granted" | "denied" | "undetermined"
  > {
    if (!mod) return "denied";
    try {
      const { status } = await mod.getPermissionsAsync();
      return status === "granted"
        ? "granted"
        : status === "denied"
          ? "denied"
          : "undetermined";
    } catch {
      return "denied";
    }
  },

  /** Prompt for permission (a no-op re-grant if already granted). Returns
   *  whether notifications may now be delivered. */
  async requestPermission(): Promise<boolean> {
    if (!mod) return false;
    try {
      const { status } = await mod.requestPermissionsAsync();
      return status === "granted";
    } catch {
      return false;
    }
  },

  /** Cancel every scheduled reminder, then reschedule the set from `plan`.
   *  Idempotent: safe to call on every relevant state change (daily solved,
   *  app foreground, toggle flipped). No-op without permission. */
  async sync(plan: ReminderPlan): Promise<void> {
    if (!mod) return;
    try {
      await configure();
      await mod.cancelAllScheduledNotificationsAsync();
      if (!plan.enabled) return;
      if ((await this.getPermissionStatus()) !== "granted") return;
      const m = mod;

      // 1) Daily puzzle ready — repeats every morning.
      await schedule(
        m,
        "daily-ready",
        "🌱 Today's puzzle is ready",
        "A fresh daily board is waiting in the garden.",
        {
          type: m.SchedulableTriggerInputTypes.DAILY,
          hour: MORNING_HOUR,
          minute: 0,
        },
      );

      // 2) Streak at risk — only while today's daily is still unsolved and an
      //    active streak is on the line. One-shot at the next evening.
      if (!plan.dailyDoneToday && plan.streak > 0) {
        await schedule(
          m,
          "streak-risk",
          "🔥 Don't lose your streak!",
          `You have time to keep your ${plan.streak}-day streak alive — today's daily is still open.`,
          {
            type: m.SchedulableTriggerInputTypes.DATE,
            date: nextAt(EVENING_HOUR),
          },
        );
      }

      // 3) Re-engage — fires only if the app isn't opened again first (every
      //    foreground reschedules these, pushing the clock back). The 3-day
      //    nudge mentions a card within reach when one is close.
      const cardHook =
        plan.starsToNextCard != null && plan.starsToNextCard <= 6
          ? ` You're only ${plan.starsToNextCard}★ from a new plant card.`
          : "";
      await schedule(
        m,
        "reengage-3d",
        "🪴 Your garden misses you",
        `Come back for a quick puzzle.${cardHook}`,
        {
          type: m.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 3 * 24 * 60 * 60,
          repeats: false,
        },
      );
      await schedule(
        m,
        "reengage-7d",
        "🌼 New puzzles are waiting",
        "It's been a while — pick up where you left off.",
        {
          type: m.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 7 * 24 * 60 * 60,
          repeats: false,
        },
      );
    } catch {}
  },

  /** Cancel all scheduled reminders (e.g. when the player turns them off). */
  async cancelAll(): Promise<void> {
    if (!mod) return;
    try {
      await mod.cancelAllScheduledNotificationsAsync();
    } catch {}
  },

  /** Register for REMOTE push and return the Expo push token. No backend yet —
   *  the token is cached/returned so a future server can store it and send
   *  `PushPayload` campaigns (new levels / new card). Requires a physical
   *  device and granted permission. */
  async registerForPush(): Promise<string | null> {
    if (!mod || !device?.isDevice) return null;
    try {
      if ((await this.getPermissionStatus()) !== "granted") return null;
      const projectId =
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require("expo-constants").default?.expoConfig?.extra?.eas?.projectId;
      const res = await mod.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined,
      );
      pushToken = res.data;
      return pushToken;
    } catch {
      return null;
    }
  },

  get pushToken(): string | null {
    return pushToken;
  },
};
