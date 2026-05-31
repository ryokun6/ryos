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
      if (state.input === action.value) return state;
      return { ...state, input: action.value };
    case "setHistoryIndex":
      // Bail out if unchanged so useReducer can skip a re-render. The
      // input-change effect re-asserts historyIndex: -1 on every keystroke,
      // which would otherwise force a second wasted render of the composer
      // because setInputAndResetHistory already reset it.
      if (state.historyIndex === action.value) return state;
      return { ...state, historyIndex: action.value };
    case "setSelectedImage":
      if (state.selectedImage === action.value) return state;
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
