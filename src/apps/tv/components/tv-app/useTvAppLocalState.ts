import { useCallback, useReducer } from "react";
import {
  createInitialTvLocalState,
  tvLocalReducer,
  type TvLocalState,
} from "./tvLocalState";

export function useTvAppLocalState(isMobileSafariDevice: boolean) {
  const [localState, dispatchLocal] = useReducer(
    tvLocalReducer,
    createInitialTvLocalState(isMobileSafariDevice)
  );

  const setField = useCallback(
    <K extends keyof TvLocalState>(
      key: K,
      value: TvLocalState[K] | ((prev: TvLocalState[K]) => TvLocalState[K])
    ) => {
      dispatchLocal({
        type: "setField",
        key,
        value: value as TvLocalState[keyof TvLocalState],
      });
    },
    []
  );

  const setLcdSlot = useCallback(
    (
      value:
        | TvLocalState["lcdSlot"]
        | ((prev: TvLocalState["lcdSlot"]) => TvLocalState["lcdSlot"])
    ) => setField("lcdSlot", value),
    [setField]
  );
  const setIsCreateChannelOpen = useCallback(
    (value: boolean) => setField("isCreateChannelOpen", value),
    [setField]
  );
  const setPendingDeleteId = useCallback(
    (value: string | null) => setField("pendingDeleteId", value),
    [setField]
  );
  const setIsResetConfirmOpen = useCallback(
    (value: boolean) => setField("isResetConfirmOpen", value),
    [setField]
  );
  const setIsDrawerOpen = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => setField("isDrawerOpen", value),
    [setField]
  );
  const setIsYoutubePasteLoading = useCallback(
    (value: boolean) => setField("isYoutubePasteLoading", value),
    [setField]
  );
  const setPowerOnKey = useCallback(
    (value: number | ((prev: number) => number)) => setField("powerOnKey", value),
    [setField]
  );
  const setChannelSwitchKey = useCallback(
    (value: number | ((prev: number) => number)) =>
      setField("channelSwitchKey", value),
    [setField]
  );
  const setPoweringOff = useCallback(
    (value: boolean) => setField("poweringOff", value),
    [setField]
  );
  const setIsBuffering = useCallback(
    (value: boolean) => setField("isBuffering", value),
    [setField]
  );
  const setScreenOff = useCallback(
    (value: boolean) => setField("screenOff", value),
    [setField]
  );
  const setIsTransitioningCc = useCallback(
    (value: boolean) => setField("isTransitioningCc", value),
    [setField]
  );

  return {
    localState,
    dispatchLocal,
    setLcdSlot,
    setIsCreateChannelOpen,
    setPendingDeleteId,
    setIsResetConfirmOpen,
    setIsDrawerOpen,
    setIsYoutubePasteLoading,
    setPowerOnKey,
    setChannelSwitchKey,
    setPoweringOff,
    setIsBuffering,
    setScreenOff,
    setIsTransitioningCc,
  };
}

export type TvAppLocalStateApi = ReturnType<typeof useTvAppLocalState>;
