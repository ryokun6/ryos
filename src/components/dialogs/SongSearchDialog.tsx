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
import { useThemeStore } from "@/stores/useThemeStore";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";

// Decode HTML entities like &#39; &amp; etc.
function decodeHtmlEntities(text: string): string {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

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

interface SongSearchDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (result: SongSearchResult) => void;
  onAddUrl?: (url: string) => Promise<void>;
  initialQuery?: string;
}

export function SongSearchDialog({
  isOpen,
  onOpenChange,
  onSelect,
  onAddUrl,
  initialQuery = "",
}: SongSearchDialogProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacTheme = currentTheme === "macosx";

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SongSearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detect if input is a YouTube URL
  const isUrl = useMemo(() => isYouTubeUrl(query), [query]);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setResults([]);
      setSelectedIndex(-1);
      setError(null);
    }
  }, [isOpen, initialQuery]);

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
    if (isUrl && onAddUrl) {
      await handleAddUrl();
      return;
    }

    setIsSearching(true);
    setError(null);
    setResults([]);
    setSelectedIndex(-1);

    try {
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

  const handleAddSelected = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < results.length) {
      onSelect(results[selectedIndex]);
      onOpenChange(false);
    }
  }, [selectedIndex, results, onSelect, onOpenChange]);

  const handleSelectAndAdd = useCallback((index: number) => {
    if (index >= 0 && index < results.length) {
      setSelectedIndex(index);
      onSelect(results[index]);
      onOpenChange(false);
    }
  }, [results, onSelect, onOpenChange]);

  const fontStyle = isXpTheme
    ? { fontFamily: '"Pixelated MS Sans Serif", "ArkPixel", Arial', fontSize: "11px" }
    : undefined;

  const fontClass = isXpTheme
    ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
    : "font-geneva-12 text-[12px]";

  const dialogContent = (
    <div className={cn(isXpTheme ? "p-2 px-4" : "p-4 px-6", "overflow-hidden w-full box-border")}>
      <p className={cn("text-gray-500 mb-2", fontClass)} style={fontStyle}>
        {t("apps.ipod.dialogs.songSearchDescription")}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && !isSearching && !isAdding) handleSearch();
          }}
          placeholder={t("apps.ipod.dialogs.songSearchPlaceholder")}
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
            ? (isUrl ? t("apps.ipod.dialogs.songSearchAdding") : t("apps.ipod.dialogs.songSearchSearching"))
            : (isUrl ? t("apps.ipod.dialogs.songSearchAdd") : t("apps.ipod.dialogs.songSearchSearch"))}
        </Button>
      </div>

      {error && (
        <p className={cn("text-red-600 mb-2", fontClass)} style={fontStyle}>
          {error}
        </p>
      )}

      {results.length > 0 && (
        <div style={{ marginBottom: "12px" }}>
          <p className={cn("text-gray-500 mb-2", fontClass)} style={fontStyle}>
            {t("apps.ipod.dialogs.songSearchSelectResult")}
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
            {results.map((result, index) => (
              <div
                key={result.videoId}
                onClick={() => setSelectedIndex(index)}
                onDoubleClick={() => handleSelectAndAdd(index)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSelectAndAdd(index);
                  }
                }}
                tabIndex={0}
                role="button"
                className={cn(fontClass, "w-full")}
                style={{
                  ...fontStyle,
                  padding: "8px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  boxSizing: "border-box",
                  background: selectedIndex === index
                    ? "var(--os-color-selection-bg)"
                    : index % 2 === 1
                      ? "#f3f4f6"
                      : "white",
                  color: selectedIndex === index ? "var(--os-color-selection-text)" : undefined,
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
                  <div
                    className="font-semibold truncate"
                  >
                    {decodeHtmlEntities(result.title)}
                  </div>
                  <div
                    className="truncate"
                    style={{
                      opacity: selectedIndex === index ? 0.8 : 1,
                      color: selectedIndex === index ? undefined : "#4b5563",
                    }}
                  >
                    {decodeHtmlEntities(result.channelTitle)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {results.length > 0 && (
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
              onClick={handleAddSelected}
              disabled={isSearching || selectedIndex < 0}
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
