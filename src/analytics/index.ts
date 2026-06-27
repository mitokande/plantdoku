// PostHog analytics wrapper. The rest of the app calls `track(...)` / `screen(...)`
// against this typed facade rather than touching PostHog directly, so there is one
// place to manage the event taxonomy, the API key, and graceful no-op behaviour.
//
// NOTE: this module imports posthog-react-native (RN-only). Keep it out of
// `src/game/*` so the headless Node tests stay framework-free.

import { Platform } from "react-native";
import PostHog from "posthog-react-native";

import type { Difficulty } from "../game/types";

// Key + host come from Expo public env vars (inlined at build time). No key ->
// analytics quietly no-ops, so dev builds and the headless web smoke-test run
// without a PostHog project. Never commit a real key; see .env.example.
const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

// posthog-react-native targets native; on web we skip it (the web build is only
// a headless smoke-test target).
const enabled = !!KEY && Platform.OS !== "web";

let client: PostHog | null = null;
if (enabled) {
  try {
    client = new PostHog(KEY as string, {
      host: HOST,
      // Casual sessions are short — flush eagerly so a one-board session reports.
      flushAt: 5,
      flushInterval: 10000,
      // Auto-captures Application Installed/Updated/Opened/Backgrounded.
      captureAppLifecycleEvents: true,
    });
  } catch {
    client = null;
  }
}

/** Every analytics event name in the app. Add new events here to keep the
 *  taxonomy in one place (and get autocomplete at every call site). */
export type EventName =
  | "screen_viewed"
  | "game_started"
  | "level_completed"
  | "board_failed"
  | "board_retried"
  | "board_reset"
  | "hint_requested"
  | "hint_applied"
  | "mistake_made"
  | "undo_used"
  | "card_unlocked"
  | "daily_completed"
  | "endless_completed"
  | "onboarding_completed"
  | "notifications_enabled"
  | "notifications_disabled"
  | "notification_permission"
  | "data_flushed";

type Props = Record<string, string | number | boolean | null | undefined>;

// Properties accepted by PostHog's capture/screen (JsonType values, no undefined).
type SdkProps = NonNullable<Parameters<PostHog["capture"]>[1]>;

// Drop `undefined` values so call sites can pass `level: x || undefined` freely.
function clean(props?: Props): SdkProps | undefined {
  if (!props) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v !== undefined) out[k] = v;
  }
  return out as SdkProps;
}

/** Common board context attached to most gameplay events. */
export interface BoardContext extends Props {
  mode: "level" | "daily" | "endless";
  level?: number;
  difficulty?: Difficulty;
  size?: number;
  tier?: number;
}

export const analytics = {
  /** True when a PostHog client is live (key present, not web). */
  enabled,

  /** Capture a product event. Safe to call regardless of init state. */
  track(name: EventName, props?: Props): void {
    if (!client) return;
    try {
      client.capture(name, clean(props));
    } catch {}
  },

  /** Record a screen view (PostHog `$screen`). */
  screen(name: string, props?: Props): void {
    if (!client) return;
    try {
      client.screen(name, clean(props));
    } catch {}
  },

  /** Clear the current person/session — call when the user wipes their data. */
  reset(): void {
    if (!client) return;
    try {
      client.reset();
    } catch {}
  },

  /** Best-effort flush of any queued events. */
  flush(): void {
    if (!client) return;
    try {
      void client.flush();
    } catch {}
  },
};
