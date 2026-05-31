export interface TvLocalState {
  lcdSlot: "now" | "next";
  scheduleAnimDirection: "next" | "prev";
  isCreateChannelOpen: boolean;
  pendingDeleteId: string | null;
  isResetConfirmOpen: boolean;
  isDrawerOpen: boolean;
  isYoutubePasteLoading: boolean;
  powerOnKey: number;
  channelSwitchKey: number;
  poweringOff: boolean;
  isBuffering: boolean;
  screenOff: boolean;
  isTransitioningCc: boolean;
}

export function createInitialTvLocalState(
  isMobileSafariDevice: boolean
): TvLocalState {
  return {
    lcdSlot: "now",
    scheduleAnimDirection: "next",
    isCreateChannelOpen: false,
    pendingDeleteId: null,
    isResetConfirmOpen: false,
    isDrawerOpen: false,
    isYoutubePasteLoading: false,
    powerOnKey: 0,
    channelSwitchKey: 0,
    poweringOff: false,
    isBuffering: false,
    screenOff: isMobileSafariDevice,
    isTransitioningCc: false,
  };
}

export type TvLocalAction =
  | { type: "patch"; payload: Partial<TvLocalState> }
  | {
      type: "setField";
      key: keyof TvLocalState;
      value:
        | TvLocalState[keyof TvLocalState]
        | ((
            prev: TvLocalState[keyof TvLocalState]
          ) => TvLocalState[keyof TvLocalState]);
    }
  | { type: "toggleLcdSlotWithDirection" };

export function tvLocalReducer(
  state: TvLocalState,
  action: TvLocalAction
): TvLocalState {
  switch (action.type) {
    case "patch":
      return { ...state, ...action.payload };
    case "setField": {
      const currentValue = state[action.key];
      const nextValue =
        typeof action.value === "function"
          ? (
              action.value as (
                prev: TvLocalState[keyof TvLocalState]
              ) => TvLocalState[keyof TvLocalState]
            )(currentValue)
          : action.value;
      return { ...state, [action.key]: nextValue } as TvLocalState;
    }
    case "toggleLcdSlotWithDirection": {
      const nextSlot = state.lcdSlot === "now" ? "next" : "now";
      return {
        ...state,
        lcdSlot: nextSlot,
        scheduleAnimDirection: nextSlot === "next" ? "next" : "prev",
      };
    }
    default:
      return state;
  }
}
