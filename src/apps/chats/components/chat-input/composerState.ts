export interface ComposerState {
  input: string;
  historyIndex: number;
  selectedImage: string | null;
}

export const composerInitialState: ComposerState = {
  input: "",
  historyIndex: -1,
  selectedImage: null,
};

export type ComposerAction =
  | { type: "setInput"; value: string }
  | { type: "setHistoryIndex"; value: number }
  | { type: "setSelectedImage"; value: string | null }
  | { type: "setInputAndResetHistory"; value: string }
  | { type: "setHistoryNavigation"; value: { index: number; input: string } }
  | { type: "clearComposer" };

export function composerReducer(
  state: ComposerState,
  action: ComposerAction
): ComposerState {
  switch (action.type) {
    case "setInput":
      return { ...state, input: action.value };
    case "setHistoryIndex":
      return { ...state, historyIndex: action.value };
    case "setSelectedImage":
      return { ...state, selectedImage: action.value };
    case "setInputAndResetHistory":
      return { ...state, input: action.value, historyIndex: -1 };
    case "setHistoryNavigation":
      return {
        ...state,
        historyIndex: action.value.index,
        input: action.value.input,
      };
    case "clearComposer":
      return { ...state, input: "", selectedImage: null };
    default:
      return state;
  }
}
