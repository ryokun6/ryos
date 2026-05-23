import { useCallback, useReducer } from "react";

/**
 * Composer (input area) state for the Chats AI view.
 *
 * Owns:
 *  - the text input value (AI SDK v5 no longer provides this)
 *  - the currently attached image preview, if any
 *  - the open/closed state of the Clear and Save dialogs and the
 *    Save-as filename input
 *
 * Pure local UI state — no Zustand reads, no network. Lives in its own
 * hook so the parent `useAiChat` orchestrator only sees the small,
 * stable surface returned here.
 */

export interface ChatUiState {
  input: string;
  selectedImage: string | null;
  isClearDialogOpen: boolean;
  isSaveDialogOpen: boolean;
  saveFileName: string;
}

const initialChatUiState: ChatUiState = {
  input: "",
  selectedImage: null,
  isClearDialogOpen: false,
  isSaveDialogOpen: false,
  saveFileName: "",
};

export type ChatUiAction =
  | { type: "setInput"; value: string }
  | { type: "setSelectedImage"; value: string | null }
  | { type: "setClearDialogOpen"; value: boolean }
  | { type: "setSaveDialogOpen"; value: boolean }
  | { type: "setSaveFileName"; value: string }
  | { type: "clearComposer" };

export function chatUiReducer(
  state: ChatUiState,
  action: ChatUiAction
): ChatUiState {
  switch (action.type) {
    case "setInput":
      return { ...state, input: action.value };
    case "setSelectedImage":
      return { ...state, selectedImage: action.value };
    case "setClearDialogOpen":
      return { ...state, isClearDialogOpen: action.value };
    case "setSaveDialogOpen":
      return { ...state, isSaveDialogOpen: action.value };
    case "setSaveFileName":
      return { ...state, saveFileName: action.value };
    case "clearComposer":
      return { ...state, input: "", selectedImage: null };
    default:
      return state;
  }
}

/**
 * Hook returning all composer state and stable action callbacks.
 *
 * Returned `set*` and event handlers are referentially stable across
 * renders (they only dispatch into the reducer), which keeps memoized
 * children like `ChatInput` from re-rendering when the composer state
 * changes elsewhere.
 */
export function useChatComposer() {
  const [state, dispatch] = useReducer(chatUiReducer, initialChatUiState);

  const setInput = useCallback((value: string) => {
    dispatch({ type: "setInput", value });
  }, []);

  const setSelectedImage = useCallback((value: string | null) => {
    dispatch({ type: "setSelectedImage", value });
  }, []);

  const setIsClearDialogOpen = useCallback((value: boolean) => {
    dispatch({ type: "setClearDialogOpen", value });
  }, []);

  const setIsSaveDialogOpen = useCallback((value: boolean) => {
    dispatch({ type: "setSaveDialogOpen", value });
  }, []);

  const setSaveFileName = useCallback((value: string) => {
    dispatch({ type: "setSaveFileName", value });
  }, []);

  const clearComposer = useCallback(() => {
    dispatch({ type: "clearComposer" });
  }, []);

  const handleInputChange = useCallback(
    (
      e:
        | React.ChangeEvent<HTMLInputElement>
        | React.ChangeEvent<HTMLTextAreaElement>
    ) => {
      dispatch({ type: "setInput", value: e.target.value });
    },
    []
  );

  const handleImageChange = useCallback((imageData: string | null) => {
    dispatch({ type: "setSelectedImage", value: imageData });
  }, []);

  return {
    state,
    dispatch,
    setInput,
    setSelectedImage,
    setIsClearDialogOpen,
    setIsSaveDialogOpen,
    setSaveFileName,
    clearComposer,
    handleInputChange,
    handleImageChange,
  };
}
