export interface MenuScrollState {
  scrollTop: number;
  containerHeight: number;
}

export const menuScrollInitialState: MenuScrollState = {
  scrollTop: 0,
  containerHeight: 0,
};

export type MenuScrollAction =
  | { type: "setScrollTop"; value: number }
  | { type: "setContainerHeight"; value: number };

export function menuScrollReducer(
  state: MenuScrollState,
  action: MenuScrollAction
): MenuScrollState {
  switch (action.type) {
    case "setScrollTop":
      if (state.scrollTop === action.value) return state;
      return { ...state, scrollTop: action.value };
    case "setContainerHeight":
      if (state.containerHeight === action.value) return state;
      return { ...state, containerHeight: action.value };
    default:
      return state;
  }
}
