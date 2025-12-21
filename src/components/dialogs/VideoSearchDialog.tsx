import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useThemeStore } from "@/stores/useThemeStore";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface VideoSearchDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSearch: (query: string) => Promise<void>;
}

export function VideoSearchDialog({
  isOpen,
  onOpenChange,
  onSearch,
}: VideoSearchDialogProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacTheme = currentTheme === "macosx";

  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setError(null);
      setIsSearching(false);
    }
  }, [isOpen]);

  const handleSearch = async () => {
    if (!query.trim()) {
      setError(t("apps.ipod.dialogs.videoSearchEmptyQuery"));
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      await onSearch(query.trim());
      onOpenChange(false);
    } catch (err) {
      console.error("Video search error:", err);
      setError(err instanceof Error ? err.message : t("apps.ipod.dialogs.videoSearchError"));
    } finally {
      setIsSearching(false);
    }
  };

  const fontStyle = isXpTheme
    ? { fontFamily: '"Pixelated MS Sans Serif", "ArkPixel", Arial', fontSize: "11px" }
    : undefined;

  const fontClass = isXpTheme
    ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
    : "font-geneva-12 text-[12px]";

  const dialogContent = (
    <div className={cn(isXpTheme ? "p-2 px-4" : "p-4 px-6", "overflow-hidden w-full box-border")}>
      <p className={cn("text-gray-500 mb-2", fontClass)} style={fontStyle}>
        {t("apps.ipod.dialogs.videoSearchDescription")}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && !isSearching) handleSearch();
          }}
          placeholder={t("apps.ipod.dialogs.videoSearchPlaceholder")}
          className={cn("shadow-none", fontClass)}
          style={fontStyle}
          disabled={isSearching}
        />
        <Button
          variant={isMacTheme ? "secondary" : "retro"}
          onClick={handleSearch}
          disabled={isSearching || !query.trim()}
          className={cn("w-full", !isMacTheme && "h-7", fontClass)}
          style={fontStyle}
        >
          {isSearching
            ? t("apps.ipod.dialogs.videoSearchSearching")
            : t("apps.ipod.dialogs.videoSearchAdd")}
        </Button>
      </div>

      {error && (
        <p className={cn("text-red-600 mb-2", fontClass)} style={fontStyle}>
          {error}
        </p>
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
            <DialogHeader>{t("apps.ipod.dialogs.videoSearchTitle")}</DialogHeader>
            <div className="window-body">{dialogContent}</div>
          </>
        ) : currentTheme === "macosx" ? (
          <>
            <DialogHeader>{t("apps.ipod.dialogs.videoSearchTitle")}</DialogHeader>
            {dialogContent}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-normal text-[16px]">
                {t("apps.ipod.dialogs.videoSearchTitle")}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t("apps.ipod.dialogs.videoSearchDescription")}
              </DialogDescription>
            </DialogHeader>
            {dialogContent}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
