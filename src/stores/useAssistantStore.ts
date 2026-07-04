import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AIChatMessage } from "@/types/chat";
import {
  DEFAULT_ASSISTANT_CHARACTER_ID,
  type AssistantCharacterId,
} from "@/components/assistant/characters";
import { STORAGE_KEYS } from "@/utils/storageKeys";

const ASSISTANT_STORE_VERSION = 1;

/** Keep the persisted assistant conversation small — it lives in localStorage. */
const MAX_PERSISTED_MESSAGES = 40;

export interface AssistantPosition {
  x: number;
  y: number;
}

interface AssistantStoreState {
  /** Whether the floating assistant is shown on the desktop. */
  enabled: boolean;
  characterId: AssistantCharacterId;
  /** Last dragged position (top-left corner). null → default bottom-right. */
  position: AssistantPosition | null;
  /** Assistant conversation (separate from the Chats app's Ryo thread). */
  messages: AIChatMessage[];
  /** Epoch ms of the last user↔assistant exchange (for greeting staleness). */
  lastInteractionAt: number | null;
  /**
   * Epoch ms when the chat bubble was last dismissed (null while open). A
   * bubble left dismissed long enough marks the conversation as done, so the
   * next summon starts fresh with a new greeting.
   */
  bubbleDismissedAt: number | null;
  /** Speak assistant replies aloud with the browser's speech synthesis. */
  speechEnabled: boolean;

  setEnabled: (enabled: boolean) => void;
  toggleEnabled: () => void;
  setCharacterId: (characterId: AssistantCharacterId) => void;
  setSpeechEnabled: (speechEnabled: boolean) => void;
  setPosition: (position: AssistantPosition | null) => void;
  setMessages: (messages: AIChatMessage[]) => void;
  clearMessages: () => void;
  markInteraction: () => void;
  markBubbleDismissed: () => void;
  clearBubbleDismissed: () => void;
}

export const useAssistantStore = create<AssistantStoreState>()(
  persist(
    (set) => ({
      enabled: true,
      characterId: DEFAULT_ASSISTANT_CHARACTER_ID,
      position: null,
      messages: [],
      lastInteractionAt: null,
      bubbleDismissedAt: null,
      speechEnabled: false,

      setEnabled: (enabled) => set({ enabled }),
      toggleEnabled: () => set((state) => ({ enabled: !state.enabled })),
      setCharacterId: (characterId) => set({ characterId }),
      setSpeechEnabled: (speechEnabled) => set({ speechEnabled }),
      setPosition: (position) => set({ position }),
      setMessages: (messages) =>
        set({
          messages: messages.slice(-MAX_PERSISTED_MESSAGES),
          lastInteractionAt: Date.now(),
        }),
      clearMessages: () =>
        set({ messages: [], lastInteractionAt: null, bubbleDismissedAt: null }),
      markInteraction: () => set({ lastInteractionAt: Date.now() }),
      markBubbleDismissed: () => set({ bubbleDismissedAt: Date.now() }),
      clearBubbleDismissed: () => set({ bubbleDismissedAt: null }),
    }),
    {
      name: STORAGE_KEYS.assistant,
      version: ASSISTANT_STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        enabled: state.enabled,
        characterId: state.characterId,
        position: state.position,
        messages: state.messages,
        lastInteractionAt: state.lastInteractionAt,
        bubbleDismissedAt: state.bubbleDismissedAt,
        speechEnabled: state.speechEnabled,
      }),
    }
  )
);
