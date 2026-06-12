import { useCallback, useReducer } from "react";

/**
 * Reducer-based dialog/overlay open state shared by the media apps (iPod,
 * Karaoke). Generalizes the inline reducer Karaoke used and the pile of
 * useStates iPod used — one `useReducer` holds every boolean flag, and each
 * flag gets a stable setter with the same call signature as a `useState`
 * setter (`boolean | ((prev: boolean) => boolean)`), so consuming logic
 * hooks can expose the setters under their existing names unchanged.
 *
 * Apps are expected to use a subset of the flags; unused flags simply stay
 * false.
 */

export type MediaAppDialogSetter = (
  value: boolean | ((prev: boolean) => boolean)
) => void;

export interface MediaAppDialogState {
  isHelpDialogOpen: boolean;
  isAboutDialogOpen: boolean;
  isConfirmClearOpen: boolean;
  isShareDialogOpen: boolean;
  isLyricsSearchDialogOpen: boolean;
  isSongSearchDialogOpen: boolean;
  isSyncModeOpen: boolean;
  isAddingSong: boolean;
  isLangMenuOpen: boolean;
  isPronunciationMenuOpen: boolean;
  isListenInviteOpen: boolean;
  isJoinListenDialogOpen: boolean;
  isCoverFlowOpen: boolean;
}

const initialState: MediaAppDialogState = {
  isHelpDialogOpen: false,
  isAboutDialogOpen: false,
  isConfirmClearOpen: false,
  isShareDialogOpen: false,
  isLyricsSearchDialogOpen: false,
  isSongSearchDialogOpen: false,
  isSyncModeOpen: false,
  isAddingSong: false,
  isLangMenuOpen: false,
  isPronunciationMenuOpen: false,
  isListenInviteOpen: false,
  isJoinListenDialogOpen: false,
  isCoverFlowOpen: false,
};

type MediaAppDialogAction = {
  type: "set";
  key: keyof MediaAppDialogState;
  value: boolean | ((prev: boolean) => boolean);
};

function dialogReducer(
  state: MediaAppDialogState,
  action: MediaAppDialogAction
): MediaAppDialogState {
  return {
    ...state,
    [action.key]:
      typeof action.value === "function"
        ? action.value(state[action.key])
        : action.value,
  };
}

export function useMediaAppDialogs() {
  const [state, dispatch] = useReducer(dialogReducer, initialState);

  const setBool = useCallback(
    (
      key: keyof MediaAppDialogState,
      value: boolean | ((prev: boolean) => boolean)
    ) => {
      dispatch({ type: "set", key, value });
    },
    []
  );

  const setIsHelpDialogOpen = useCallback<MediaAppDialogSetter>(
    (value) => setBool("isHelpDialogOpen", value),
    [setBool]
  );
  const setIsAboutDialogOpen = useCallback<MediaAppDialogSetter>(
    (value) => setBool("isAboutDialogOpen", value),
    [setBool]
  );
  const setIsConfirmClearOpen = useCallback<MediaAppDialogSetter>(
    (value) => setBool("isConfirmClearOpen", value),
    [setBool]
  );
  const setIsShareDialogOpen = useCallback<MediaAppDialogSetter>(
    (value) => setBool("isShareDialogOpen", value),
    [setBool]
  );
  const setIsLyricsSearchDialogOpen = useCallback<MediaAppDialogSetter>(
    (value) => setBool("isLyricsSearchDialogOpen", value),
    [setBool]
  );
  const setIsSongSearchDialogOpen = useCallback<MediaAppDialogSetter>(
    (value) => setBool("isSongSearchDialogOpen", value),
    [setBool]
  );
  const setIsSyncModeOpen = useCallback<MediaAppDialogSetter>(
    (value) => setBool("isSyncModeOpen", value),
    [setBool]
  );
  const setIsAddingSong = useCallback<MediaAppDialogSetter>(
    (value) => setBool("isAddingSong", value),
    [setBool]
  );
  const setIsLangMenuOpen = useCallback<MediaAppDialogSetter>(
    (value) => setBool("isLangMenuOpen", value),
    [setBool]
  );
  const setIsPronunciationMenuOpen = useCallback<MediaAppDialogSetter>(
    (value) => setBool("isPronunciationMenuOpen", value),
    [setBool]
  );
  const setIsListenInviteOpen = useCallback<MediaAppDialogSetter>(
    (value) => setBool("isListenInviteOpen", value),
    [setBool]
  );
  const setIsJoinListenDialogOpen = useCallback<MediaAppDialogSetter>(
    (value) => setBool("isJoinListenDialogOpen", value),
    [setBool]
  );
  const setIsCoverFlowOpen = useCallback<MediaAppDialogSetter>(
    (value) => setBool("isCoverFlowOpen", value),
    [setBool]
  );

  return {
    ...state,
    setIsHelpDialogOpen,
    setIsAboutDialogOpen,
    setIsConfirmClearOpen,
    setIsShareDialogOpen,
    setIsLyricsSearchDialogOpen,
    setIsSongSearchDialogOpen,
    setIsSyncModeOpen,
    setIsAddingSong,
    setIsLangMenuOpen,
    setIsPronunciationMenuOpen,
    setIsListenInviteOpen,
    setIsJoinListenDialogOpen,
    setIsCoverFlowOpen,
  };
}
