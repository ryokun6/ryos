import { useState, useEffect, useCallback, useMemo } from "react";
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
import { Tabs } from "@/components/ui/tabs";
import { useThemeStore } from "@/stores/useThemeStore";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";
import { decodeHtmlEntities } from "@/utils/decodeHtmlEntities";
import {
  ThemedTabsList,
  ThemedTabsTrigger,
} from "@/components/shared/ThemedTabs";
import type { Track } from "@/stores/useIpodStore";

// Check if input looks like a YouTube URL
function isYouTubeUrl(input: string): boolean {
  const trimmed = input.trim();
  return (
    trimmed.includes("youtube.com/watch") ||
    trimmed.includes("youtu.be/") ||
    trimmed.includes("youtube.com/shorts/") ||
    trimmed.includes("music.youtube.com/watch")
  );
}

export interface SongSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  publishedAt: string;
}

type AppleMusicSearchScope = "catalog" | "library";
type SearchMode = "youtube" | "appleMusic";

interface SongSearchDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (result: SongSearchResult) => void;
  onAddUrl?: (url: string) => Promise<void>;
  initialQuery?: string;
  mode?: SearchMode;
  appleMusicAuthorized?: boolean;
  onAppleMusicSearch?: (
    query: string,
    scope: AppleMusicSearchScope
  ) => Promise<Track[]>;
  onAppleMusicSelect?: (track: Track) => Promise<void> | void;
}

export function SongSearchDialog({
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
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacTheme = currentTheme === "macosx";

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SongSearchResult[]>([]);
  const [appleMusicResults, setAppleMusicResults] = useState<Track[]>([]);
  const [activeAppleMusicTab, setActiveAppleMusicTab] =
    useState<AppleMusicSearchScope>("catalog");
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAppleMusicMode = mode === "appleMusic";

  // Detect if input is a YouTube URL
  const isUrl = useMemo(() => isYouTubeUrl(query), [query]);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setResults([]);
      setAppleMusicResults([]);
      setSelectedIndex(-1);
      setError(null);
    }
  }, [isOpen, initialQuery]);

  useEffect(() => {
    setAppleMusicResults([]);
    setSelectedIndex(-1);
    setError(null);
  }, [activeAppleMusicTab]);

  const handleAddUrl = async () => {
    if (!onAddUrl || !query.trim()) return;
    
    setIsAdding(true);
    setError(null);
    
    try {
      await onAddUrl(query.trim());
      onOpenChange(false);
    } catch (err) {
      console.error("Add URL error:", err);
      setError(err instanceof Error ? err.message : t("apps.ipod.dialogs.songSearchError"));
    } finally {
      setIsAdding(false);
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) {
      setError(t("apps.ipod.dialogs.songSearchEmptyQuery"));
      return;
    }

    // If it's a URL, add directly instead of searching
    if (!isAppleMusicMode && isUrl && onAddUrl) {
      await handleAddUrl();
      return;
    }

    setIsSearching(true);
    setError(null);
    setResults([]);
    setAppleMusicResults([]);
    setSelectedIndex(-1);

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
        setAppleMusicResults(appleResults);
        if (appleResults.length === 0) {
          setError(t("apps.ipod.dialogs.songSearchNoResults"));
        }
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
        let errorMsg = errorData.error || `Failed to search (status ${response.status})`;
        if (errorData.hint) errorMsg += ` - ${errorData.hint}`;
        throw new Error(response.status === 404 ? t("apps.ipod.dialogs.songSearchNoResults") : errorMsg);
      }

      const data = await response.json();
      if (data.results && Array.isArray(data.results)) {
        setResults(data.results);
        if (data.results.length === 0) setError(t("apps.ipod.dialogs.songSearchNoResults"));
      } else {
        throw new Error(t("apps.ipod.dialogs.songSearchInvalidResponse"));
      }
    } catch (err) {
      console.error("Song search error:", err);
      setError(err instanceof Error ? err.message : t("apps.ipod.dialogs.songSearchError"));
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddSelected = useCallback(async () => {
    if (isAppleMusicMode) {
      if (
        selectedIndex >= 0 &&
        selectedIndex < appleMusicResults.length &&
        onAppleMusicSelect
      ) {
        setIsAdding(true);
        try {
          await onAppleMusicSelect(appleMusicResults[selectedIndex]);
          onOpenChange(false);
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : t("apps.ipod.dialogs.songSearchError")
          );
        } finally {
          setIsAdding(false);
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

  const handleSelectAndAdd = useCallback(async (index: number) => {
    if (isAppleMusicMode) {
      if (index >= 0 && index < appleMusicResults.length && onAppleMusicSelect) {
        setSelectedIndex(index);
        setIsAdding(true);
        try {
          await onAppleMusicSelect(appleMusicResults[index]);
          onOpenChange(false);
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : t("apps.ipod.dialogs.songSearchError")
          );
        } finally {
          setIsAdding(false);
        }
      }
      return;
    }

    if (index >= 0 && index < results.length) {
      setSelectedIndex(index);
      onSelect(results[index]);
      onOpenChange(false);
    }
  }, [
    isAppleMusicMode,
    appleMusicResults,
    onAppleMusicSelect,
    results,
    onSelect,
    onOpenChange,
    t,
  ]);

  const fontStyle = isXpTheme
    ? { fontFamily: '"Pixelated MS Sans Serif", "ArkPixel", Arial', fontSize: "11px" }
    : undefined;

  const fontClass = isXpTheme
    ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
    : "font-geneva-12 text-[12px]";

  const displayedResults = isAppleMusicMode ? appleMusicResults : results;
  const hasResults = displayedResults.length > 0;

  const searchControls = (
    <>
      {isAppleMusicMode && (
        <Tabs
          value={activeAppleMusicTab}
          onValueChange={(value) =>
            setActiveAppleMusicTab(value as AppleMusicSearchScope)
          }
          className="w-full"
        >
          <ThemedTabsList className="w-full mb-2">
            <ThemedTabsTrigger value="catalog" className="flex-1">
              {t("apps.ipod.dialogs.appleMusicSearchAppleMusic", "Apple Music")}
            </ThemedTabsTrigger>
            <ThemedTabsTrigger value="library" className="flex-1">
              {t("apps.ipod.dialogs.appleMusicSearchLibrary", "Library")}
            </ThemedTabsTrigger>
          </ThemedTabsList>
        </Tabs>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && !isSearching && !isAdding) handleSearch();
          }}
          placeholder={
            isAppleMusicMode
              ? t(
                  "apps.ipod.dialogs.appleMusicSearchPlaceholder",
                  "Search Apple Music..."
                )
              : t("apps.ipod.dialogs.songSearchPlaceholder")
          }
          className={cn("shadow-none", fontClass)}
          style={fontStyle}
          disabled={isSearching || isAdding}
        />
        <Button
          variant={isMacTheme ? "secondary" : "retro"}
          onClick={handleSearch}
          disabled={isSearching || isAdding || !query.trim()}
          className={cn("w-full", !isMacTheme && "h-7", fontClass)}
          style={fontStyle}
        >
          {isSearching || isAdding
            ? isUrl && !isAppleMusicMode
              ? t("apps.ipod.dialogs.songSearchAdding")
              : t("apps.ipod.dialogs.songSearchSearching")
            : isUrl && !isAppleMusicMode
            ? t("apps.ipod.dialogs.songSearchAdd")
            : t("apps.ipod.dialogs.songSearchSearch")}
        </Button>
      </div>
    </>
  );

  const renderResult = (index: number) => {
    const selected = selectedIndex === index;
    if (isAppleMusicMode) {
      const result = appleMusicResults[index];
      return (
        <div
          key={`${result.id}-${index}`}
          onClick={() => setSelectedIndex(index)}
          onDoubleClick={() => void handleSelectAndAdd(index)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              void handleSelectAndAdd(index);
            }
          }}
          tabIndex={0}
          role="button"
          className={cn(fontClass, "w-full")}
          data-selected={selected ? "true" : undefined}
          style={{
            ...fontStyle,
            padding: "8px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            boxSizing: "border-box",
            background: selected
              ? undefined
              : index % 2 === 1
              ? "#f3f4f6"
              : "white",
          }}
        >
          {result.cover && (
            <img
              src={result.cover}
              alt=""
              style={{
                width: "42px",
                height: "42px",
                objectFit: "cover",
                borderRadius: "4px",
                flexShrink: 0,
              }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0, width: 0 }}>
            <div className="font-semibold truncate">{result.title}</div>
            <div
              className="truncate"
              style={{
                opacity: selected ? 0.8 : 1,
                color: selected ? undefined : "#4b5563",
              }}
            >
              {[result.artist, result.album].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
      );
    }

    const result = results[index];
    return (
      <div
        key={result.videoId}
        onClick={() => setSelectedIndex(index)}
        onDoubleClick={() => void handleSelectAndAdd(index)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void handleSelectAndAdd(index);
          }
        }}
        tabIndex={0}
        role="button"
        className={cn(fontClass, "w-full")}
        data-selected={selected ? "true" : undefined}
        style={{
          ...fontStyle,
          padding: "8px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          boxSizing: "border-box",
          background: selected
            ? undefined
            : index % 2 === 1
            ? "#f3f4f6"
            : "white",
        }}
      >
        {result.thumbnail && (
          <img
            src={result.thumbnail}
            alt=""
            style={{ width: "48px", height: "36px", objectFit: "cover", borderRadius: "4px", flexShrink: 0 }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0, width: 0 }}>
          <div className="font-semibold truncate">
            {decodeHtmlEntities(result.title)}
          </div>
          <div
            className="truncate"
            style={{
              opacity: selected ? 0.8 : 1,
              color: selected ? undefined : "#4b5563",
            }}
          >
            {decodeHtmlEntities(result.channelTitle)}
          </div>
        </div>
      </div>
    );
  };

  const dialogContent = (
    <div className={cn(isXpTheme ? "p-2 px-4" : "p-4 px-6", "overflow-hidden w-full box-border")}>
      {!isAppleMusicMode && (
        <p className={cn("text-gray-500 mb-2", fontClass)} style={fontStyle}>
          {t("apps.ipod.dialogs.songSearchDescription")}
        </p>
      )}

      {searchControls}

      {error && (
        <p className={cn("text-red-600 mb-2", fontClass)} style={fontStyle}>
          {error}
        </p>
      )}

      {hasResults && (
        <div style={{ marginBottom: "12px" }}>
          <p className={cn("text-gray-500 mb-2", fontClass)} style={fontStyle}>
            {isAppleMusicMode
              ? t(
                  "apps.ipod.dialogs.appleMusicSearchSelectResult",
                  "Select a song to add:"
                )
              : t("apps.ipod.dialogs.songSearchSelectResult")}
          </p>
          <div
            style={{
              border: "1px solid #d1d5db",
              borderRadius: "6px",
              backgroundColor: "white",
              height: "280px",
              overflowY: "auto",
              overflowX: "hidden",
            }}
          >
            {displayedResults.map((_, index) => renderResult(index))}
          </div>
        </div>
      )}

      {hasResults && (
        <DialogFooter className="mt-4 gap-1 sm:justify-end">
          <div className="flex flex-col-reverse gap-2 w-full sm:w-auto sm:flex-row">
            <Button
              variant={isMacTheme ? "secondary" : "retro"}
              onClick={() => onOpenChange(false)}
              disabled={isSearching}
              className={cn("w-full sm:w-auto", !isMacTheme && "h-7", fontClass)}
              style={fontStyle}
            >
              {t("common.dialog.cancel")}
            </Button>
            <Button
              variant={isMacTheme ? "default" : "retro"}
              onClick={() => void handleAddSelected()}
              disabled={isSearching || isAdding || selectedIndex < 0}
              className={cn("w-full sm:w-auto", !isMacTheme && "h-7", fontClass)}
              style={fontStyle}
            >
              {t("apps.ipod.dialogs.songSearchAddSelected")}
            </Button>
          </div>
        </DialogFooter>
      )}
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(isXpTheme && "p-0")}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {isXpTheme ? (
          <>
            <DialogHeader>{t("apps.ipod.dialogs.addSongTitle")}</DialogHeader>
            <div className="window-body">{dialogContent}</div>
          </>
        ) : currentTheme === "macosx" ? (
          <>
            <DialogHeader>{t("apps.ipod.dialogs.addSongTitle")}</DialogHeader>
            {dialogContent}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-normal text-[16px]">
                {t("apps.ipod.dialogs.addSongTitle")}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t("apps.ipod.dialogs.songSearchDescription")}
              </DialogDescription>
            </DialogHeader>
            {dialogContent}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
