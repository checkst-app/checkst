import { useCallback } from "react";
import { backend } from "../lib/backend";
import { useSettings } from "../lib/settings";

/**
 * confirm: checked off · tick: reopened or added · threshold: a swipe will act when released ·
 * longpress: a held task opens its quick actions
 */
export type Haptic = "confirm" | "tick" | "threshold" | "longpress";

/** Haptic and sound feedback for task actions, as far as the settings allow. Fire and forget. */
export function useFeedback() {
  const { settings } = useSettings();
  const { haptics, sounds } = settings;
  return useCallback(
    (haptic?: Haptic, sound?: "complete") => {
      const h = haptics ? haptic : undefined;
      const s = sounds ? sound : undefined;
      if (h || s) backend.feedback(h, s).catch(() => {});
    },
    [haptics, sounds],
  );
}
