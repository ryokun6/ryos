// src/lib/audioContext.ts
// Centralised Web Audio context handling used across the application.
// This consolidates creation, resumption and recreation logic to work around
// iOS Safari quirks (e.g., contexts getting stuck in "suspended" or non-standard
// "interrupted" states, or being closed when the page is backgrounded for a
// while).

let audioContext: AudioContext | null = null;

/**
 * Return a valid AudioContext instance.
 * If the previous one has been closed (which Safari may do when tab is
 * backgrounded for a long time) a brand-new context is created.
 */
export const getAudioContext = (): AudioContext => {
  if (!audioContext || audioContext.state === "closed") {
    try {
      audioContext = new AudioContext();
      console.debug("[audioContext] Created new AudioContext");
    } catch (err) {
      console.error("[audioContext] Failed to create AudioContext:", err);
      // Return a dummy context to avoid callers exploding – this will do
      // nothing but at least has the expected shape.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore – Constructing the dummy to satisfy type, never used.
      audioContext = { state: "closed" } as AudioContext;
    }
  }
  return audioContext;
};

/**
 * Ensure the global `AudioContext` is in the `running` state. If it is
 * `suspended`/`interrupted`, attempt `resume()`. If that fails, recreate a
 * brand-new context so that subsequent playback succeeds.
 */
export const resumeAudioContext = async (): Promise<void> => {
  let ctx = getAudioContext();
  let state = ctx.state as AudioContextState | "interrupted";

  if (state === "suspended" || state === "interrupted") {
    try {
      await ctx.resume();
      console.debug("[audioContext] Resumed AudioContext");
    } catch (err) {
      console.error("[audioContext] Failed to resume AudioContext:", err);
    }
  }

  state = ctx.state as AudioContextState | "interrupted";
  if (state !== "running") {
    try {
      console.debug(
        `[audioContext] AudioContext still in state "${state}" after resume – recreating`
      );
      await ctx.close();
    } catch (err) {
      console.error("[audioContext] Failed to close AudioContext:", err);
    }

    audioContext = null; // Force getAudioContext() to make a new one
    ctx = getAudioContext();
  }
};

// Attach global listeners once (when this module is imported) so that the
// context is auto-resumed when the tab regains focus or visibility.
if (typeof document !== "undefined" && typeof window !== "undefined") {
  const handleVisibility = () => {
    if (document.visibilityState === "visible") {
      void resumeAudioContext();
    }
  };
  const handleFocus = () => void resumeAudioContext();
  document.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("focus", handleFocus);
}
