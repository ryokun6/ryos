// src/lib/audioContext.ts
// Centralised Web Audio context handling used across the application.
// This consolidates creation, resumption and recreation logic to work around
// iOS Safari quirks (e.g., contexts getting stuck in "suspended" or non-standard
// "interrupted" states, or being closed when the page is backgrounded for a
// while).

// Safari pre-2017 requires webkitAudioContext prefix
const AudioContextClass =
  window.AudioContext ||
  (window as unknown as { webkitAudioContext?: typeof AudioContext })
    .webkitAudioContext;

let audioContext: AudioContext | null = null;

// Concurrency control for resumeAudioContext to prevent race conditions
let resumeInProgress: Promise<void> | null = null;

// Context change event system for modules that need to reset state when context is recreated
type ContextChangeListener = (newContext: AudioContext) => void;
const contextChangeListeners = new Set<ContextChangeListener>();

export const onContextChange = (listener: ContextChangeListener) => {
  contextChangeListeners.add(listener);
  return () => contextChangeListeners.delete(listener);
};

const notifyContextChange = (newContext: AudioContext) => {
  contextChangeListeners.forEach((listener) => {
    try {
      listener(newContext);
    } catch (err) {
      console.error("[audioContext] Context change listener error:", err);
    }
  });
};

/**
 * Return a valid AudioContext instance.
 * If the previous one has been closed (which Safari may do when tab is
 * backgrounded for a long time) a brand-new context is created.
 */
export const getAudioContext = (): AudioContext => {
  if (!audioContext || audioContext.state === "closed") {
    try {
      if (!AudioContextClass) {
        throw new Error("AudioContext not supported in this browser");
      }
      audioContext = new AudioContextClass({ latencyHint: "interactive" });
      audioContext.onstatechange = () => {
        console.debug("[audioContext] State changed to:", audioContext?.state);
      };
      console.debug("[audioContext] Created new AudioContext");
      notifyContextChange(audioContext);
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
  // If there's already a resume in progress, wait for it
  if (resumeInProgress) {
    await resumeInProgress;
    // After waiting, check if context is now running
    if (audioContext?.state === "running") {
      return;
    }
    // If still not running, fall through to try again
  }

  // Create the resume promise
  const thisAttempt = (async () => {
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
      // Note: getAudioContext() already calls notifyContextChange when creating new context
    }
  })();

  resumeInProgress = thisAttempt;

  try {
    await thisAttempt;
  } finally {
    // Only clear if this is still our attempt (not overwritten by another caller)
    if (resumeInProgress === thisAttempt) {
      resumeInProgress = null;
    }
  }
};

// Attach global listeners once (when this module is imported) so that the
// context is auto-resumed when the tab regains focus or visibility.
let visibilityHandler: (() => void) | null = null;
let focusHandler: (() => void) | null = null;
let deviceChangeHandler: (() => void) | null = null;

function setupAudioContextListeners() {
  if (typeof document !== "undefined" && typeof window !== "undefined") {
    // Clean up any existing listeners first (for HMR)
    if (visibilityHandler) {
      document.removeEventListener("visibilitychange", visibilityHandler);
    }
    if (focusHandler) {
      window.removeEventListener("focus", focusHandler);
    }

    visibilityHandler = () => {
      if (document.visibilityState === "visible") {
        void resumeAudioContext();
      }
    };
    focusHandler = () => void resumeAudioContext();
    
    document.addEventListener("visibilitychange", visibilityHandler);
    window.addEventListener("focus", focusHandler);

    // Handle Bluetooth/AirPlay device switching
    if (typeof navigator !== "undefined" && navigator.mediaDevices) {
      if (deviceChangeHandler) {
        navigator.mediaDevices.removeEventListener(
          "devicechange",
          deviceChangeHandler
        );
      }
      deviceChangeHandler = () => {
        console.debug("[audioContext] Audio device changed, resuming context");
        void resumeAudioContext();
      };
      navigator.mediaDevices.addEventListener(
        "devicechange",
        deviceChangeHandler
      );
    }
  }
}

setupAudioContextListeners();

// HMR cleanup - remove listeners when module is replaced
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (visibilityHandler) {
      document.removeEventListener("visibilitychange", visibilityHandler);
      visibilityHandler = null;
    }
    if (focusHandler) {
      window.removeEventListener("focus", focusHandler);
      focusHandler = null;
    }
    if (deviceChangeHandler && navigator.mediaDevices) {
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        deviceChangeHandler
      );
      deviceChangeHandler = null;
    }
    console.debug("[audioContext] HMR cleanup: removed listeners");
  });
}
