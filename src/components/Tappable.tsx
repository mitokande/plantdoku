import React from "react";
import { Pressable, type PressableProps } from "react-native";

import { audio } from "../audio";

interface Props extends PressableProps {
  /**
   * Suppress the click for a press that isn't a UI action: skipping the splash
   * or fast-forwarding the win reveal, where the tap is impatience rather than
   * a control, and a click on top of a jingle just muddies it. Prefer this to
   * reaching for a bare `Pressable` — a raw one silently opts out of the whole
   * convention, which is how the sound went missing everywhere but `Button` in
   * the first place.
   */
  silent?: boolean;
}

/**
 * A `Pressable` that plays the UI click.
 *
 * Every tappable thing in the app should be this or `Button` (which plays the
 * same cue itself), so audio feedback is a property of "being tappable" rather
 * than something each call site remembers. `button` is mixed near-subliminal at
 * −27dB precisely so it can be on *everything* without becoming noise; a UI
 * where only some controls answer reads as broken rather than as restrained.
 *
 * Props pass straight through, so this is a drop-in for `Pressable` — including
 * the render-prop `children`/`style` forms.
 */
export function Tappable({ onPress, onLongPress, silent, ...rest }: Props) {
  return (
    <Pressable
      {...rest}
      onPress={
        onPress &&
        ((e) => {
          if (!silent) audio.play("button");
          onPress(e);
        })
      }
      onLongPress={
        onLongPress &&
        ((e) => {
          if (!silent) audio.play("button");
          onLongPress(e);
        })
      }
    />
  );
}
