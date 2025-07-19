// src/lib/audioContext.ts
// Centralised Web Audio context handling used across the application.
// This consolidates creation, resumption and recreation logic to work around
// iOS Safari quirks (e.g., contexts getting stuck in "suspended" or non-standard
// "interrupted" states, or being closed when the page is backgrounded for a
// while).

let audioContext: AudioContext | null = null;
let hasUserInteracted = false;
let isSafari = false;

// Detect Safari early
if (typeof navigator !== "undefined") {
  isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent) && !/CriOS/.test(navigator.userAgent);
}

/**
 * Mark that user has interacted with the page
 * This is crucial for Safari's autoplay policies
 */
export const markUserInteraction = () => {
  hasUserInteracted = true;
  // Try to resume audio context immediately after user interaction
  void resumeAudioContext();
};

/**
 * Check if user has interacted with the page
 */
export const hasUserInteractedWithPage = (): boolean => {
  return hasUserInteracted;
};

/**
 * Return a valid AudioContext instance.
 * If the previous one has been closed (which Safari may do when tab is
 * backgrounded for a long time) a brand-new context is created.
 */
export const getAudioContext = (): AudioContext => {
  if (!audioContext || audioContext.state === "closed") {
    try {
      // For Safari, we need to ensure user interaction before creating context
      if (isSafari && !hasUserInteracted) {
        console.debug("[audioContext] Safari detected - waiting for user interaction before creating AudioContext");
        // Return a dummy context that will be replaced after user interaction
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore – Constructing the dummy to satisfy type, never used.
        return { state: "suspended" } as AudioContext;
      }
      
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
  // For Safari, ensure user has interacted before attempting to resume
  if (isSafari && !hasUserInteracted) {
    console.debug("[audioContext] Safari detected - cannot resume AudioContext without user interaction");
    return;
  }

  let ctx = getAudioContext();
  let state = ctx.state as AudioContextState | "interrupted";

  // If context is closed, we need to create a new one
  if (state === "closed") {
    audioContext = null;
    ctx = getAudioContext();
    state = ctx.state as AudioContextState | "interrupted";
  }

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

/**
 * Safari-specific function to handle audio context after page becomes visible
 */
export const handleSafariVisibilityChange = async (): Promise<void> => {
  if (!isSafari) return;
  
  // Safari may have suspended the audio context when the page was backgrounded
  if (document.visibilityState === "visible") {
    console.debug("[audioContext] Safari page became visible - attempting to resume audio");
    await resumeAudioContext();
  }
};

// Attach global listeners once (when this module is imported) so that the
// context is auto-resumed when the tab regains focus or visibility.
if (typeof document !== "undefined" && typeof window !== "undefined") {
  const handleVisibility = () => {
    if (document.visibilityState === "visible") {
      void resumeAudioContext();
      void handleSafariVisibilityChange();
    }
  };
  
  const handleFocus = () => {
    void resumeAudioContext();
    void handleSafariVisibilityChange();
  };
  
  // Mark user interaction on any user gesture
  const handleUserInteraction = () => {
    markUserInteraction();
    // Remove listeners after first interaction to avoid repeated work
    document.removeEventListener("click", handleUserInteraction);
    document.removeEventListener("touchstart", handleUserInteraction);
    document.removeEventListener("keydown", handleUserInteraction);
  };
  
  document.addEventListener("visibilitychange", handleVisibility);
  window.addEventListener("focus", handleFocus);
  
  // Listen for user interactions to satisfy Safari's autoplay policy
  document.addEventListener("click", handleUserInteraction, { once: true });
  document.addEventListener("touchstart", handleUserInteraction, { once: true });
  document.addEventListener("keydown", handleUserInteraction, { once: true });
}
