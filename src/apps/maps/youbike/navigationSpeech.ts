/**
 * YouBike turn-by-turn speech uses the same Chat / Ryo `useTtsQueue` pipeline
 * (`speak` → `/api/speech` → shared `AudioContext`). This module only holds
 * the active hook's `stop` so Stop / Done / clear-route can cancel from
 * outside the card.
 */

type StopFn = () => void;

let activeStop: StopFn | null = null;

/** Bind the mounted navigation hook's `useTtsQueue().stop`. */
export function registerYouBikeNavigationSpeechStop(
  stop: StopFn
): () => void {
  activeStop = stop;
  return () => {
    if (activeStop === stop) activeStop = null;
  };
}

/** Drop any in-flight YouBike navigation clip. */
export function cancelYouBikeNavigationSpeech(): void {
  activeStop?.();
}

/** Test helper: clear the registered stop between suites. */
export function __resetYouBikeNavigationSpeechForTests(): void {
  activeStop = null;
}
