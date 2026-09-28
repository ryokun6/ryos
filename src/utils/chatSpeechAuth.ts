/**
 * Chat / Ryo TTS may only be enabled while signed in. Logged-out users who
 * flip the Chat Speech (or Control Panels Speech) toggle get the existing
 * login dialog; the preference stays off so they can re-toggle after login.
 *
 * Browser TTS (TextEdit, Maps, Books, Calculator, desktop assistant) does
 * not use this helper.
 */

export function requestSetChatSpeechEnabled(input: {
  enabled: boolean;
  isAuthenticated: boolean;
  promptLogin: () => void;
  setSpeechEnabled: (enabled: boolean) => void;
}): boolean {
  if (input.enabled && !input.isAuthenticated) {
    input.promptLogin();
    return false;
  }
  input.setSpeechEnabled(input.enabled);
  return true;
}
