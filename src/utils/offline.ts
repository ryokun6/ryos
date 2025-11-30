import { toast } from "sonner";

/**
 * Check if the browser is currently offline
 */
export function isOffline(): boolean {
  if (typeof navigator !== "undefined" && "onLine" in navigator) {
    return !navigator.onLine;
  }
  return false;
}

/**
 * Show an offline error toast notification
 * Uses a unique ID to prevent duplicate toasts
 */
export function showOfflineError(message?: string): void {
  toast.error(message || "This feature requires an internet connection", {
    id: "offline-error",
    duration: 3000,
  });
}

/**
 * Check if offline and show error if so. Returns true if offline.
 */
export function checkOfflineAndShowError(message?: string): boolean {
  if (isOffline()) {
    showOfflineError(message);
    return true;
  }
  return false;
}

/**
 * List of features that require network access
 */
export const NETWORK_DEPENDENT_FEATURES = {
  INTERNET_EXPLORER_NAVIGATION: "Internet Explorer navigation",
  CHATS_AI: "AI chat",
  CHATS_ROOMS: "Chat rooms",
  LYRICS_FETCH: "Lyrics fetching",
  AI_GENERATION: "AI website generation",
  SPEECH_TTS: "Text-to-speech",
  AUDIO_TRANSCRIPTION: "Audio transcription",
  APPLET_NETWORK: "Applet network features",
} as const;

