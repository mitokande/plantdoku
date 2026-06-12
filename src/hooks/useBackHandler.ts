import { useEffect, useRef } from "react";
import { BackHandler, Platform } from "react-native";

/**
 * Run `handler` on the Android hardware/gesture back press; return true to
 * consume the press, false to let it fall through (and eventually exit).
 *
 * Registers exactly once per mount and reads the latest handler via a ref:
 * BackHandler invokes listeners most-recently-registered first, so priority
 * is mount order (overlays mount above their screen and win automatically).
 * Re-registering on every render would scramble that order.
 */
export function useBackHandler(handler: () => boolean) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () =>
      ref.current(),
    );
    return () => sub.remove();
  }, []);
}
