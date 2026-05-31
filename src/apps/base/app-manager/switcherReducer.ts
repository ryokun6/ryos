import { switcherInitialState } from "./constants";
import type { SwitcherAction, SwitcherState } from "./types";

export function switcherReducer(
  state: SwitcherState,
  action: SwitcherAction
): SwitcherState {
  switch (action.type) {
    case "setVisible":
      return { ...state, visible: action.value };
    case "setApps":
      return { ...state, apps: action.value };
    case "setIndex":
      return { ...state, index: action.value };
    case "open":
      return { visible: true, apps: action.apps, index: action.index };
    case "reset":
      return switcherInitialState;
    default:
      return state;
  }
}
