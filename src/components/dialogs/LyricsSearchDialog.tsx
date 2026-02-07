import React, { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useThemeStore } from "@/stores/useThemeStore";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { getApiUrl } from "@/utils/platform";
import { ScrollArea } from "@/components/ui/scroll-area";
import { abortableFetch } from "@/utils/abortableFetch";

export interface LyricsSearchResult {
  title: string;
  artist: string;
  album?: string;
  hash: string;
  albumId: string | number;
  score: number;
}

interface LyricsSearchDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Song ID (e.g., YouTube video ID) for API calls */
  trackId: string;
  trackTitle: string;
  trackArtist?: string;
  initialQuery?: string;
  onSelect: (result: LyricsSearchResult) => void;
  onReset: () => void;
  hasOverride: boolean;
  /** Current active selection (shown when dialog opens) */
  currentSelection?: {
    title: string;
    artist: string;
    album?: string;
  };
}

export function LyricsSearchDialog({
  isOpen,
  onOpenChange,
  trackId,
  trackTitle,
  trackArtist,
  initialQuery,
  onSelect,
  onReset,
  hasOverride,
  currentSelection,
}: LyricsSearchDialogProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacTheme = currentTheme === "macosx";

  const [query, setQuery] = useState(initialQuery || "");
  const [results, setResults] = useState<LyricsSearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery || "");
      setResults([]);
      setSelectedIndex(-1);
      setError(null);
    }
  }, [isOpen, initialQuery]);

  const handleSearch = async () => {
    if (!query.trim()) {
      setError(t("apps.ipod.dialogs.lyricsSearchEmptyQuery"));
      return;
    }

    setIsSearching(true);
    setError(null);
    setResults([]);
    setSelectedIndex(-1);

    try {
      const response = await abortableFetch(
        getApiUrl(`/api/songs/${encodeURIComponent(trackId)}`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "search-lyrics",
            query: query.trim(),
          }),
          timeout: 15000,
          throwOnHttpError: false,
          retry: { maxAttempts: 1, initialDelayMs: 250 },
        }
      );

      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? t("apps.ipod.dialogs.lyricsSearchNoResults")
            : `Failed to search (status ${response.status})`
        );
      }

      const data = await response.json();
      if (data.results && Array.isArray(data.results)) {
        setResults(data.results);
        if (data.results.length === 0) {
          setError(t("apps.ipod.dialogs.lyricsSearchNoResults"));
        }
      } else {
        throw new Error(t("apps.ipod.dialogs.lyricsSearchInvalidResponse"));
      }
    } catch (err) {
      console.error("Lyrics search error:", err);
      setError(
        err instanceof Error
          ? err.message
          : t("apps.ipod.dialogs.lyricsSearchError")
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleUseSelected = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < results.length) {
      onSelect(results[selectedIndex]);
      onOpenChange(false);
    }
  }, [selectedIndex, results, onSelect, onOpenChange]);

  const handleSelectAndUse = useCallback((index: number) => {
    if (index >= 0 && index < results.length) {
      setSelectedIndex(index);
      onSelect(results[index]);
      onOpenChange(false);
    }
  }, [results, onSelect, onOpenChange]);

  const handleReset = useCallback(() => {
    onReset();
    onOpenChange(false);
  }, [onReset, onOpenChange]);

  const handleDialogKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
  }, []);

  const dialogContent = (
    <div className={isXpTheme ? "p-2 px-4" : "p-4 px-6"}>
      <p
        className={cn(
          "text-gray-500 mb-2",
          isXpTheme
            ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
            : "font-geneva-12 text-[12px]"
        )}
        style={{
          fontFamily: isXpTheme
            ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
            : undefined,
          fontSize: isXpTheme ? "11px" : undefined,
        }}
        id="dialog-description"
      >
        {t("apps.ipod.dialogs.lyricsSearchDescription", {
          title: trackTitle,
          artist: trackArtist || t("apps.ipod.menu.unknownArtist"),
        })}
      </p>

      <div className="flex gap-2 mb-3">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && !isSearching) {
              handleSearch();
            }
          }}
          placeholder={t("apps.ipod.dialogs.lyricsSearchPlaceholder")}
          className={cn(
            "shadow-none flex-1",
            isXpTheme
              ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
              : "font-geneva-12 text-[12px]"
          )}
          style={{
            fontFamily: isXpTheme
              ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
              : undefined,
            fontSize: isXpTheme ? "11px" : undefined,
          }}
          disabled={isSearching}
        />
        <Button
          variant={isMacTheme ? "secondary" : "retro"}
          onClick={handleSearch}
          disabled={isSearching || !query.trim()}
          className={cn(
            "flex-shrink-0",
            !isMacTheme && "h-7",
            isXpTheme
              ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
              : "font-geneva-12 text-[12px]"
          )}
          style={{
            fontFamily: isXpTheme
              ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
              : undefined,
            fontSize: isXpTheme ? "11px" : undefined,
          }}
        >
          {isSearching
            ? t("apps.ipod.dialogs.lyricsSearchSearching")
            : t("apps.ipod.dialogs.lyricsSearchSearch")}
        </Button>
      </div>

      {/* Show current active selection when there's an override */}
      {hasOverride && currentSelection && results.length === 0 && !isSearching && (
        <div className="mb-3">
          <p
            className={cn(
              "text-gray-500 mb-2",
              isXpTheme
                ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                : "font-geneva-12 text-[12px]"
            )}
            style={{
              fontFamily: isXpTheme
                ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                : undefined,
              fontSize: isXpTheme ? "11px" : undefined,
            }}
          >
            {t("apps.ipod.dialogs.lyricsSearchCurrentSelection")}
          </p>
          <div className="border border-gray-300 rounded-md overflow-hidden bg-white">
            <div
              className={cn(
                "px-2 py-1.5",
                isXpTheme
                  ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                  : "font-geneva-12 text-[12px]"
              )}
              style={{
                fontFamily: isXpTheme
                  ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                  : undefined,
                fontSize: isXpTheme ? "11px" : undefined,
                background: "var(--os-color-selection-bg)",
                color: "var(--os-color-selection-text)",
              }}
            >
              <div className="font-semibold">{currentSelection.title}</div>
              <div className="opacity-80">
                {currentSelection.artist}
                {currentSelection.album && ` • ${currentSelection.album}`}
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p
          className={cn(
            "text-red-600 mb-2",
            isXpTheme
              ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
              : "font-geneva-12 text-[12px]"
          )}
          style={{
            fontFamily: isXpTheme
              ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
              : undefined,
            fontSize: isXpTheme ? "11px" : undefined,
          }}
        >
          {error}
        </p>
      )}

      {results.length > 0 && (
        <div className="mb-3">
          <p
            className={cn(
              "text-gray-500 mb-2",
              isXpTheme
                ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                : "font-geneva-12 text-[12px]"
            )}
            style={{
              fontFamily: isXpTheme
                ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                : undefined,
              fontSize: isXpTheme ? "11px" : undefined,
            }}
          >
            {t("apps.ipod.dialogs.lyricsSearchSelectResult")}
          </p>
          <ScrollArea className="h-[200px] border border-gray-300 rounded-md overflow-hidden bg-white">
            <div>
              {results.map((result, index) => (
                <div
                  key={result.hash}
                  onClick={() => setSelectedIndex(index)}
                  onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSelectAndUse(index);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  className={cn(
                    "px-2 py-1.5 cursor-pointer",
                    selectedIndex === index
                      ? "" // Selection styling handled by inline style
                      : index % 2 === 1
                        ? "bg-gray-100"
                        : "bg-white",
                    isXpTheme
                      ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                      : "font-geneva-12 text-[12px]"
                  )}
                  style={{
                    fontFamily: isXpTheme
                      ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                      : undefined,
                    fontSize: isXpTheme ? "11px" : undefined,
                    ...(selectedIndex === index
                      ? {
                          background: "var(--os-color-selection-bg)",
                          color: "var(--os-color-selection-text)",
                        }
                      : {}),
                  }}
                >
                  <div className="font-semibold">{result.title}</div>
                  <div
                    className={cn(
                      selectedIndex === index ? "opacity-80" : "text-neutral-600"
                    )}
                  >
                    {result.artist}
                    {result.album && ` • ${result.album}`}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      <DialogFooter className="mt-4 gap-1 sm:justify-between">
        <div className="flex gap-1 w-full sm:w-auto">
          {hasOverride && (
            <Button
              variant="retro"
              onClick={handleReset}
              disabled={isSearching}
              className={cn(
                "w-full sm:w-auto h-7",
                isXpTheme
                  ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                  : "font-geneva-12 text-[12px]"
              )}
              style={{
                fontFamily: isXpTheme
                  ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                  : undefined,
                fontSize: isXpTheme ? "11px" : undefined,
              }}
            >
              {t("apps.ipod.dialogs.lyricsSearchReset")}
            </Button>
          )}
        </div>
        {/* Only show Cancel and Use Selected when there are results */}
        {results.length > 0 && (
          <div className="flex flex-col-reverse gap-2 w-full sm:w-auto sm:flex-row">
            <Button
              variant={isMacTheme ? "secondary" : "retro"}
              onClick={() => onOpenChange(false)}
              disabled={isSearching}
              className={cn(
                "w-full sm:w-auto",
                !isMacTheme && "h-7",
                isXpTheme
                  ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                  : "font-geneva-12 text-[12px]"
              )}
              style={{
                fontFamily: isXpTheme
                  ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                  : undefined,
                fontSize: isXpTheme ? "11px" : undefined,
              }}
            >
              {t("common.dialog.cancel")}
            </Button>
            <Button
              variant={isMacTheme ? "default" : "retro"}
              onClick={handleUseSelected}
              disabled={isSearching || selectedIndex < 0}
              className={cn(
                "w-full sm:w-auto",
                !isMacTheme && "h-7",
                isXpTheme
                  ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                  : "font-geneva-12 text-[12px]"
              )}
              style={{
                fontFamily: isXpTheme
                  ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                  : undefined,
                fontSize: isXpTheme ? "11px" : undefined,
              }}
            >
              {t("apps.ipod.dialogs.lyricsSearchUseSelected")}
            </Button>
          </div>
        )}
      </DialogFooter>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("max-w-[600px]", isXpTheme && "p-0 overflow-hidden")}
        style={isXpTheme ? { fontSize: "11px" } : undefined}
        onKeyDown={handleDialogKeyDown}
      >
        {isXpTheme ? (
          <>
            <DialogHeader>
              {t("apps.ipod.dialogs.lyricsSearchTitle")}
            </DialogHeader>
            <div className="window-body">{dialogContent}</div>
          </>
        ) : currentTheme === "macosx" ? (
          <>
            <DialogHeader>
              {t("apps.ipod.dialogs.lyricsSearchTitle")}
            </DialogHeader>
            {dialogContent}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-normal text-[16px]">
                {t("apps.ipod.dialogs.lyricsSearchTitle")}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t("apps.ipod.dialogs.lyricsSearchDescription", {
                  title: trackTitle,
                  artist: trackArtist || t("apps.ipod.menu.unknownArtist"),
                })}
              </DialogDescription>
            </DialogHeader>
            {dialogContent}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

