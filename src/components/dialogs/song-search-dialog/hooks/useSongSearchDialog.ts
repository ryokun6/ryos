import { useReducer, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";
import {
  createSongSearchInitialState,
  songSearchReducer,
} from "../songSearchReducer";
import type { SongSearchDialogProps } from "../types";
import { isYouTubeUrl } from "../utils";
import { createClientLogger } from "@/utils/logger";

const songSearchLog = createClientLogger("SongSearch");

export function useSongSearchDialog({
  isOpen,
  onOpenChange,
  onSelect,
  onAddUrl,
  initialQuery = "",
  mode = "youtube",
  appleMusicAuthorized = false,
  onAppleMusicSearch,
  onAppleMusicSelect,
}: SongSearchDialogProps) {
  const { t } = useTranslation();
  const {
    isWindowsTheme,
    isMacOSTheme: isMacTheme,
  } = useThemeFlags();

  const [state, dispatch] = useReducer(
    songSearchReducer,
    createSongSearchInitialState(initialQuery)
  );
  const {
    query,
    results,
    appleMusicResults,
    activeAppleMusicTab,
    selectedIndex,
    isSearching,
    isAdding,
    error,
  } = state;
  const isAppleMusicMode = mode === "appleMusic";
  const isUrl = useMemo(() => isYouTubeUrl(query), [query]);

  useEffect(() => {
    if (isOpen) {
      dispatch({ type: "resetOnOpen", query: initialQuery });
    }
  }, [isOpen, initialQuery]);

  const handleAddUrl = async () => {
    if (!onAddUrl || !query.trim()) return;

    dispatch({ type: "setAdding", isAdding: true });
    dispatch({ type: "setError", error: null });

    try {
      await onAddUrl(query.trim());
      onOpenChange(false);
    } catch (err) {
      songSearchLog.error("addUrl:failed", { error: err, query: query.trim() });
      dispatch({
        type: "setError",
        error:
          err instanceof Error
            ? err.message
            : t("apps.ipod.dialogs.songSearchError"),
      });
    } finally {
      dispatch({ type: "setAdding", isAdding: false });
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) {
      dispatch({
        type: "searchError",
        error: t("apps.ipod.dialogs.songSearchEmptyQuery"),
      });
      return;
    }

    if (!isAppleMusicMode && isUrl && onAddUrl) {
      await handleAddUrl();
      return;
    }

    dispatch({ type: "searchStart" });

    try {
      if (isAppleMusicMode) {
        if (!appleMusicAuthorized) {
          throw new Error(
            t(
              "apps.ipod.dialogs.appleMusicSearchSignInRequired",
              "Sign in to Apple Music to search"
            )
          );
        }
        if (!onAppleMusicSearch) {
          throw new Error(
            t(
              "apps.ipod.dialogs.appleMusicSearchUnavailable",
              "Apple Music search is unavailable"
            )
          );
        }
        const appleResults = await onAppleMusicSearch(
          query.trim(),
          activeAppleMusicTab
        );
        dispatch({
          type: "searchFinish",
          mode: "appleMusic",
          results: appleResults,
          error:
            appleResults.length === 0
              ? t("apps.ipod.dialogs.songSearchNoResults")
              : null,
        });
        return;
      }

      const response = await abortableFetch(getApiUrl("/api/youtube-search"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), maxResults: 15 }),
        timeout: 15000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 250 },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        let errorMsg =
          typeof errorData.error === "string" && errorData.error
            ? errorData.error
            : t("apps.ipod.dialogs.songSearchHttpError", {
                status: response.status,
              });
        if (typeof errorData.hint === "string" && errorData.hint) {
          errorMsg = t("apps.ipod.dialogs.songSearchHttpErrorWithHint", {
            error: errorMsg,
            hint: errorData.hint,
          });
        }
        throw new Error(
          response.status === 404
            ? t("apps.ipod.dialogs.songSearchNoResults")
            : errorMsg
        );
      }

      const data = await response.json();
      if (data.results && Array.isArray(data.results)) {
        dispatch({
          type: "searchFinish",
          mode: "youtube",
          results: data.results,
          error:
            data.results.length === 0
              ? t("apps.ipod.dialogs.songSearchNoResults")
              : null,
        });
      } else {
        throw new Error(t("apps.ipod.dialogs.songSearchInvalidResponse"));
      }
    } catch (err) {
      songSearchLog.error("search:failed", {
        error: err,
        mode,
        appleMusicScope: isAppleMusicMode ? activeAppleMusicTab : undefined,
        query: query.trim(),
      });
      dispatch({
        type: "searchError",
        error:
          err instanceof Error
            ? err.message
            : t("apps.ipod.dialogs.songSearchError"),
      });
    }
  };

  const handleAddSelected = useCallback(async () => {
    if (isAppleMusicMode) {
      if (
        selectedIndex >= 0 &&
        selectedIndex < appleMusicResults.length &&
        onAppleMusicSelect
      ) {
        dispatch({ type: "setAdding", isAdding: true });
        try {
          await onAppleMusicSelect(appleMusicResults[selectedIndex]);
          onOpenChange(false);
        } catch (err) {
          songSearchLog.error("appleMusicSelect:failed", {
            error: err,
            trackId: appleMusicResults[selectedIndex]?.id,
            title: appleMusicResults[selectedIndex]?.title,
          });
          dispatch({
            type: "setError",
            error:
              err instanceof Error
                ? err.message
                : t("apps.ipod.dialogs.songSearchError"),
          });
        } finally {
          dispatch({ type: "setAdding", isAdding: false });
        }
      }
      return;
    }

    if (selectedIndex >= 0 && selectedIndex < results.length) {
      onSelect(results[selectedIndex]);
      onOpenChange(false);
    }
  }, [
    isAppleMusicMode,
    selectedIndex,
    appleMusicResults,
    onAppleMusicSelect,
    results,
    onSelect,
    onOpenChange,
    t,
  ]);

  const handleSelectAndAdd = useCallback(
    async (index: number) => {
      if (isAppleMusicMode) {
        if (
          index >= 0 &&
          index < appleMusicResults.length &&
          onAppleMusicSelect
        ) {
          dispatch({ type: "setSelectedIndex", index });
          dispatch({ type: "setAdding", isAdding: true });
          try {
            await onAppleMusicSelect(appleMusicResults[index]);
            onOpenChange(false);
          } catch (err) {
            songSearchLog.error("appleMusicSelect:failed", {
              error: err,
              trackId: appleMusicResults[index]?.id,
              title: appleMusicResults[index]?.title,
            });
            dispatch({
              type: "setError",
              error:
                err instanceof Error
                  ? err.message
                  : t("apps.ipod.dialogs.songSearchError"),
            });
          } finally {
            dispatch({ type: "setAdding", isAdding: false });
          }
        }
        return;
      }

      if (index >= 0 && index < results.length) {
        dispatch({ type: "setSelectedIndex", index });
        onSelect(results[index]);
        onOpenChange(false);
      }
    },
    [
      isAppleMusicMode,
      appleMusicResults,
      onAppleMusicSelect,
      results,
      onSelect,
      onOpenChange,
      t,
    ]
  );

  const fontStyle = isWindowsTheme
    ? {
        fontFamily: '"Pixelated MS Sans Serif", "ArkPixel", Arial',
        fontSize: "11px",
      }
    : undefined;

  const fontClass = isWindowsTheme
    ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
    : "font-geneva-12 text-[12px]";

  const displayedResults = isAppleMusicMode ? appleMusicResults : results;
  const hasResults = displayedResults.length > 0;

  return {
    t,
    isWindowsTheme,
    isMacTheme,
    dispatch,
    query,
    results,
    appleMusicResults,
    activeAppleMusicTab,
    selectedIndex,
    isSearching,
    isAdding,
    error,
    isAppleMusicMode,
    isUrl,
    handleSearch,
    handleAddSelected,
    handleSelectAndAdd,
    fontStyle,
    fontClass,
    displayedResults,
    hasResults,
    onOpenChange,
  };
}

export type SongSearchDialogViewModel = ReturnType<typeof useSongSearchDialog>;
