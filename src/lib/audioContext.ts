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
 * Safari-specific: wait for the AudioContext state to actually change after resume().
 * Safari sometimes has a delay between the resume() promise resolving and the state updating.
 */
const waitForRunningState = async (
  ctx: AudioContext,
  timeoutMs = 100
): Promise<boolean> => {
  if (ctx.state === "running") return true;

  return new Promise((resolve) => {
    const start = Date.now();

    // Listen for state change
    const onStateChange = () => {
      if (ctx.state === "running") {
        ctx.removeEventListener("statechange", onStateChange);
        resolve(true);
      }
    };
    ctx.addEventListener("statechange", onStateChange);

    // Also poll in case the event doesn't fire (Safari quirk)
    const checkState = () => {
      if (ctx.state === "running") {
        ctx.removeEventListener("statechange", onStateChange);
        resolve(true);
      } else if (Date.now() - start < timeoutMs) {
        setTimeout(checkState, 10);
      } else {
        ctx.removeEventListener("statechange", onStateChange);
        resolve(false);
      }
    };
    setTimeout(checkState, 10);
  });
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
        // Safari may need a moment for the state to actually update
        const resumed = await waitForRunningState(ctx);
        if (resumed) {
          console.debug("[audioContext] Resumed AudioContext");
          return; // Successfully resumed, exit early
        }
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

      // The new context may also start suspended on Safari - try to resume it
      if (ctx.state !== "running") {
        try {
          await ctx.resume();
          await waitForRunningState(ctx);
          console.debug("[audioContext] Resumed newly created AudioContext");
        } catch (err) {
          console.debug(
            "[audioContext] Could not resume new context (may need user gesture):",
            err
          );
        }
      }
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
let healthCheckInterval: ReturnType<typeof setInterval> | null = null;

// Track whether unlock listeners are currently attached
let unlockListenersAttached = false;

// Detect Safari for Safari-specific workarounds
const isSafari = typeof navigator !== "undefined" &&
  /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

// User gesture events that iOS Safari recognizes for audio unlock
const GESTURE_EVENTS = ["touchstart", "touchend", "click", "keydown"] as const;

/**
 * Handler that attempts to resume AudioContext during a user gesture.
 * iOS Safari requires resume() to be called directly within a gesture handler.
 * This handler stays attached and will re-unlock audio after returning from background.
 */
const unlockAudioHandler = () => {
  const ctx = audioContext;
  if (!ctx) return;

  const state = ctx.state as AudioContextState | "interrupted";

  // If already running, nothing to do
  if (state === "running") return;

  // If context is closed, we need a new one
  if (state === "closed") {
    audioContext = null;
    const newCtx = getAudioContext();
    // Try to resume the new context within this gesture
    newCtx.resume().then(() => {
      if (newCtx.state === "running") {
        console.debug("[audioContext] Audio unlocked with new context via user gesture");
      }
    }).catch((err) => {
      console.debug("[audioContext] Failed to resume new context:", err);
    });
    return;
  }

  // Try to resume - must happen synchronously within the gesture handler
  ctx.resume().then(() => {
    if (ctx.state === "running") {
      console.debug("[audioContext] Audio unlocked/resumed via user gesture");
    }
  }).catch((err) => {
    console.debug("[audioContext] Audio unlock attempt failed:", err);
  });

  // Also try playing a silent buffer as a fallback for older iOS versions
  // This technique works on iOS 6-8 where resume() alone may not work
  try {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    source.stop(0);
  } catch {
    // Ignore errors - this is just a fallback
  }
};

/**
 * iOS Safari requires AudioContext.resume() to be called directly within a user
 * gesture event handler. This sets up persistent listeners on user gesture events
 * to unlock/resume audio. The listeners remain attached because iOS can suspend
 * the context again when the app goes to background.
 */
function attachUnlockListeners() {
  if (typeof document === "undefined" || unlockListenersAttached) {
    return;
  }

  // Use capture phase to ensure we get the event before anything else
  GESTURE_EVENTS.forEach((event) => {
    document.addEventListener(event, unlockAudioHandler, { capture: true, passive: true });
  });
  unlockListenersAttached = true;
  console.debug("[audioContext] Attached audio unlock listeners");
}

function detachUnlockListeners() {
  if (!unlockListenersAttached) return;
  
  GESTURE_EVENTS.forEach((event) => {
    document.removeEventListener(event, unlockAudioHandler, true);
  });
  unlockListenersAttached = false;
  console.debug("[audioContext] Detached audio unlock listeners");
}

function setupAudioContextListeners() {
  if (typeof document !== "undefined" && typeof window !== "undefined") {
    // Clean up any existing listeners first (for HMR)
    if (visibilityHandler) {
      document.removeEventListener("visibilitychange", visibilityHandler);
    }
    if (focusHandler) {
      window.removeEventListener("focus", focusHandler);
    }
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
      healthCheckInterval = null;
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

    // Set up iOS Safari audio unlock listeners (persistent, not one-time)
    attachUnlockListeners();

    // Safari-specific: periodic health check for stuck audio context
    // Safari can get into states where the context appears suspended but won't resume
    // without user interaction. This check helps detect and log such states.
    if (isSafari) {
      healthCheckInterval = setInterval(() => {
        if (!audioContext) return;
        
        const state = audioContext.state as AudioContextState | "interrupted";
        
        // If context is interrupted or suspended while tab is visible, try to resume
        if (
          (state === "interrupted" || state === "suspended") &&
          document.visibilityState === "visible"
        ) {
          console.debug(
            `[audioContext] Health check: context in "${state}" state while visible, attempting resume`
          );
          // Don't await - just trigger the resume attempt
          void resumeAudioContext();
        }
        
        // If context is closed while tab is visible, try to recreate
        if (state === "closed" && document.visibilityState === "visible") {
          console.debug(
            "[audioContext] Health check: context closed while visible, recreating"
          );
          audioContext = null;
          getAudioContext();
        }
      }, 5000); // Check every 5 seconds
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
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
      healthCheckInterval = null;
    }
    detachUnlockListeners();
    console.debug("[audioContext] HMR cleanup: removed listeners");
  });
}
