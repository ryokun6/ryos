import { create } from "zustand";
import { useStoreShallow } from "./helpers";
import { persist } from "zustand/middleware";

/**
 * Audio settings store - manages volume controls and audio preferences.
 * Extracted from useAppStore to reduce complexity and improve separation of concerns.
 */

interface AudioSettingsState {
  // Volume controls
  masterVolume: number;
  uiVolume: number;
  chatSynthVolume: number;
  speechVolume: number;
  ipodVolume: number;
  ttsMusicDuckingFactor: number;
  ttsChatSynthDuckingFactor: number;

  // Audio feature toggles
  uiSoundsEnabled: boolean;
  terminalSoundsEnabled: boolean;
  typingSynthEnabled: boolean;
  speechEnabled: boolean;
  keepTalkingEnabled: boolean;

  // TTS settings
  ttsModel: "openai" | "elevenlabs" | null;
  ttsVoice: string | null;
  /**
   * Preferred browser speechSynthesis voice (voiceURI) used by all
   * browser-based TTS (Calculator speech, Books read-aloud). `null` picks a
   * voice automatically from the utterance language. Device-local: voice
   * lists differ per browser/OS, so this is intentionally not cloud-synced.
   */
  browserTtsVoiceURI: string | null;
  synthPreset: string;

  // Actions
  setMasterVolume: (v: number) => void;
  setUiVolume: (v: number) => void;
  setChatSynthVolume: (v: number) => void;
  setSpeechVolume: (v: number) => void;
  setIpodVolume: (v: number) => void;
  setTtsDuckingFactors: (factors: {
    music: number;
    chatSynth: number;
  }) => void;
  setUiSoundsEnabled: (v: boolean) => void;
  setTerminalSoundsEnabled: (v: boolean) => void;
  setTypingSynthEnabled: (v: boolean) => void;
  setSpeechEnabled: (v: boolean) => void;
  setKeepTalkingEnabled: (v: boolean) => void;
  setTtsModel: (m: "openai" | "elevenlabs" | null) => void;
  setTtsVoice: (v: string | null) => void;
  setBrowserTtsVoiceURI: (v: string | null) => void;
  setSynthPreset: (v: string) => void;
}

const STORE_VERSION = 1;

export const useAudioSettingsStore = create<AudioSettingsState>()(
  persist(
    (set) => ({
      // Default values
      masterVolume: 1,
      uiVolume: 1,
      chatSynthVolume: 2,
      speechVolume: 2,
      ipodVolume: 1,
      ttsMusicDuckingFactor: 1,
      ttsChatSynthDuckingFactor: 1,

      uiSoundsEnabled: true,
      terminalSoundsEnabled: true,
      typingSynthEnabled: false,
      speechEnabled: false,
      keepTalkingEnabled: true,

      ttsModel: null,
      ttsVoice: null,
      browserTtsVoiceURI: null,
      synthPreset: "classic",

      // Actions
      setMasterVolume: (v) => set({ masterVolume: v }),
      setUiVolume: (v) => set({ uiVolume: v }),
      setChatSynthVolume: (v) => set({ chatSynthVolume: v }),
      setSpeechVolume: (v) => set({ speechVolume: v }),
      setIpodVolume: (v) => set({ ipodVolume: v }),
      setTtsDuckingFactors: ({ music, chatSynth }) =>
        set({
          ttsMusicDuckingFactor: music,
          ttsChatSynthDuckingFactor: chatSynth,
        }),
      setUiSoundsEnabled: (v) => set({ uiSoundsEnabled: v }),
      setTerminalSoundsEnabled: (v) => set({ terminalSoundsEnabled: v }),
      setTypingSynthEnabled: (v) => set({ typingSynthEnabled: v }),
      setSpeechEnabled: (v) => set({ speechEnabled: v }),
      setKeepTalkingEnabled: (v) => set({ keepTalkingEnabled: v }),
      setTtsModel: (m) => set({ ttsModel: m }),
      setTtsVoice: (v) => set({ ttsVoice: v }),
      setBrowserTtsVoiceURI: (v) => set({ browserTtsVoiceURI: v }),
      setSynthPreset: (v) => set({ synthPreset: v }),
    }),
    {
      name: "ryos:audio-settings",
      version: STORE_VERSION,
      partialize: (state) => ({
        masterVolume: state.masterVolume,
        uiVolume: state.uiVolume,
        chatSynthVolume: state.chatSynthVolume,
        speechVolume: state.speechVolume,
        ipodVolume: state.ipodVolume,
        uiSoundsEnabled: state.uiSoundsEnabled,
        terminalSoundsEnabled: state.terminalSoundsEnabled,
        typingSynthEnabled: state.typingSynthEnabled,
        speechEnabled: state.speechEnabled,
        keepTalkingEnabled: state.keepTalkingEnabled,
        ttsModel: state.ttsModel,
        ttsVoice: state.ttsVoice,
        browserTtsVoiceURI: state.browserTtsVoiceURI,
        synthPreset: state.synthPreset,
      }),
    }
  )
);

// Re-export commonly used selectors for convenience
export const selectMasterVolume = (state: AudioSettingsState) => state.masterVolume;
export const selectUiVolume = (state: AudioSettingsState) => state.uiVolume;
export const selectUiSoundsEnabled = (state: AudioSettingsState) => state.uiSoundsEnabled;
export const selectEffectiveIpodVolume = (state: AudioSettingsState) =>
  state.ipodVolume * state.masterVolume * state.ttsMusicDuckingFactor;
export const selectEffectiveChatSynthVolume = (state: AudioSettingsState) =>
  state.chatSynthVolume * state.masterVolume * state.ttsChatSynthDuckingFactor;

/**
 * Shallow-equality selector hook for this store. Co-located with the store
 * (rather than a central helpers barrel) so importing it doesn't pull other
 * stores into the bundle.
 */
export function useAudioSettingsStoreShallow<T>(
  selector: (state: ReturnType<typeof useAudioSettingsStore.getState>) => T
): T {
  return useStoreShallow(useAudioSettingsStore, selector);
}
