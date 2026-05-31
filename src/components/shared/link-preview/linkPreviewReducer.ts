import type { LinkPreviewAction, LinkPreviewState } from "./types";

export function linkPreviewReducer(
  state: LinkPreviewState,
  action: LinkPreviewAction
): LinkPreviewState {
  switch (action.type) {
    case "resetForUrl":
      return {
        ...state,
        isFullWidthThumbnail: action.isFullWidthThumbnail,
        metadata: null,
        loading: true,
        error: null,
      };
    case "fetchStart":
      return { ...state, loading: true, error: null };
    case "fetchSuccess":
      return {
        ...state,
        metadata: action.metadata,
        loading: false,
        error: null,
      };
    case "fetchFailure":
      return {
        ...state,
        metadata: action.metadata,
        loading: false,
        error: action.error,
      };
    case "setFullWidthThumbnail":
      return { ...state, isFullWidthThumbnail: action.enabled };
    default:
      return state;
  }
}

export function createInitialLinkPreviewState(
  url: string,
  isYouTube: (u: string) => boolean
): LinkPreviewState {
  return {
    metadata: null,
    loading: true,
    error: null,
    isFullWidthThumbnail: isYouTube(url),
  };
}
