import { create } from "zustand";
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

  // Audio feature toggles
  uiSoundsEnabled: boolean;
  terminalSoundsEnabled: boolean;
  typingSynthEnabled: boolean;
  speechEnabled: boolean;
  keepTalkingEnabled: boolean;

  // TTS settings
  ttsModel: "openai" | "elevenlabs" | null;
  ttsVoice: string | null;
  synthPreset: string;

  // Actions
  setMasterVolume: (v: number) => void;
  setUiVolume: (v: number) => void;
  setChatSynthVolume: (v: number) => void;
  setSpeechVolume: (v: number) => void;
  setIpodVolume: (v: number) => void;
  setUiSoundsEnabled: (v: boolean) => void;
  setTerminalSoundsEnabled: (v: boolean) => void;
  setTypingSynthEnabled: (v: boolean) => void;
  setSpeechEnabled: (v: boolean) => void;
  setKeepTalkingEnabled: (v: boolean) => void;
  setTtsModel: (m: "openai" | "elevenlabs" | null) => void;
  setTtsVoice: (v: string | null) => void;
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

      uiSoundsEnabled: true,
      terminalSoundsEnabled: true,
      typingSynthEnabled: false,
      speechEnabled: false,
      keepTalkingEnabled: true,

      ttsModel: null,
      ttsVoice: null,
      synthPreset: "classic",

      // Actions
      setMasterVolume: (v) => set({ masterVolume: v }),
      setUiVolume: (v) => set({ uiVolume: v }),
      setChatSynthVolume: (v) => set({ chatSynthVolume: v }),
      setSpeechVolume: (v) => set({ speechVolume: v }),
      setIpodVolume: (v) => set({ ipodVolume: v }),
      setUiSoundsEnabled: (v) => set({ uiSoundsEnabled: v }),
      setTerminalSoundsEnabled: (v) => set({ terminalSoundsEnabled: v }),
      setTypingSynthEnabled: (v) => set({ typingSynthEnabled: v }),
      setSpeechEnabled: (v) => set({ speechEnabled: v }),
      setKeepTalkingEnabled: (v) => set({ keepTalkingEnabled: v }),
      setTtsModel: (m) => set({ ttsModel: m }),
      setTtsVoice: (v) => set({ ttsVoice: v }),
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
        synthPreset: state.synthPreset,
      }),
    }
  )
);

// Re-export commonly used selectors for convenience
export const selectMasterVolume = (state: AudioSettingsState) => state.masterVolume;
export const selectUiVolume = (state: AudioSettingsState) => state.uiVolume;
export const selectUiSoundsEnabled = (state: AudioSettingsState) => state.uiSoundsEnabled;
