// src/utils/safariAudio.ts
// Safari-specific audio handling utilities

import { getAudioContext, resumeAudioContext, hasUserInteractedWithPage, markUserInteraction } from "@/lib/audioContext";

// Re-export markUserInteraction for convenience
export { markUserInteraction } from "@/lib/audioContext";

// Safari detection
export const isSafari = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent) && !/CriOS/.test(navigator.userAgent);
};

// iOS Safari detection
export const isIOSSafari = (): boolean => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);
};

/**
 * Safari-specific audio context recovery
 * Handles the case where Safari suspends or closes the audio context
 * when the page is backgrounded for extended periods
 */
export const recoverSafariAudioContext = async (): Promise<boolean> => {
  if (!isSafari()) return true; // Not Safari, no special handling needed
  
  try {
    const ctx = getAudioContext();
    
    // Check if context is in a problematic state
    if (ctx.state === "closed") {
      console.debug("[safariAudio] AudioContext was closed, attempting recovery");
      // The getAudioContext function should handle recreation
      return true;
    }
    
    if (ctx.state === "suspended") {
      console.debug("[safariAudio] AudioContext suspended, attempting to resume");
      await resumeAudioContext();
      // After resume, just return true if we didn't throw an error
      return true;
    }
    
    // If we get here, context should be in a good state
    return true;
  } catch (error) {
    console.error("[safariAudio] Failed to recover audio context:", error);
    return false;
  }
};

/**
 * Ensure audio can play in Safari by checking user interaction requirements
 */
export const ensureSafariAudioPlayback = async (): Promise<boolean> => {
  if (!isSafari()) return true;
  
  // Safari requires user interaction before audio can play
  if (!hasUserInteractedWithPage()) {
    console.debug("[safariAudio] Safari requires user interaction before audio playback");
    return false;
  }
  
  return await recoverSafariAudioContext();
};

/**
 * Safari-specific visibility change handler
 * Called when the page becomes visible again after being backgrounded
 */
export const handleSafariVisibilityChange = async (): Promise<void> => {
  if (!isSafari()) return;
  
  if (document.visibilityState === "visible") {
    console.debug("[safariAudio] Safari page became visible, recovering audio context");
    await recoverSafariAudioContext();
  }
};

/**
 * Force user interaction for Safari audio policies
 * This can be called programmatically if needed
 */
export const forceSafariUserInteraction = (): void => {
  if (!isSafari()) return;
  
  markUserInteraction();
  console.debug("[safariAudio] Forced user interaction for Safari audio policies");
};

/**
 * Safari-specific audio element creation with proper error handling
 */
export const createSafariCompatibleAudio = (src: string): HTMLAudioElement => {
  const audio = new Audio();
  
  // Safari-specific audio element setup
  if (isSafari()) {
    // Set preload to none to avoid autoplay issues
    audio.preload = "none";
    
    // Add error handling for Safari
    audio.addEventListener("error", (e) => {
      console.error("[safariAudio] Audio element error:", e);
    });
    
    // Add load handling
    audio.addEventListener("canplaythrough", () => {
      console.debug("[safariAudio] Audio element ready for playback");
    });
  }
  
  audio.src = src;
  return audio;
};

/**
 * Safari-specific audio playback with proper context handling
 */
export const playSafariCompatibleAudio = async (audio: HTMLAudioElement): Promise<void> => {
  if (!isSafari()) {
    // Non-Safari browsers can play directly
    await audio.play();
    return;
  }
  
  // Safari requires special handling
  if (!hasUserInteractedWithPage()) {
    console.debug("[safariAudio] Cannot play audio without user interaction in Safari");
    return;
  }
  
  try {
    // Ensure audio context is ready
    await recoverSafariAudioContext();
    
    // Attempt to play
    await audio.play();
  } catch (error) {
    console.error("[safariAudio] Failed to play audio in Safari:", error);
  }
};

// Set up global Safari audio event listeners
if (typeof document !== "undefined" && typeof window !== "undefined") {
  // Handle visibility changes
  document.addEventListener("visibilitychange", () => {
    void handleSafariVisibilityChange();
  });
  
  // Handle focus events
  window.addEventListener("focus", () => {
    void handleSafariVisibilityChange();
  });
  
  // Handle page show events (Safari specific)
  window.addEventListener("pageshow", () => {
    void handleSafariVisibilityChange();
  });
}