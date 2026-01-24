import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useThemeStore } from "@/stores/useThemeStore";
import { cn } from "@/lib/utils";

interface JoinSessionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onJoin: (sessionId: string) => void;
}

function extractSessionId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split("/").filter(Boolean);
    const listenIndex = segments.indexOf("listen");
    if (listenIndex >= 0 && segments[listenIndex + 1]) {
      // Remove any query params that might be attached
      return segments[listenIndex + 1].split("?")[0];
    }
  } catch {
    // Not a URL, fall through
  }

  if (trimmed.includes("/listen/")) {
    const parts = trimmed.split("/listen/");
    // Remove any query params and path segments after the session ID
    const sessionPart = parts[1]?.split("/")[0] || "";
    return sessionPart.split("?")[0] || trimmed;
  }

  // If it's just a plain ID, strip any query params
  return trimmed.split("?")[0];
}

export function JoinSessionDialog({
  isOpen,
  onClose,
  onJoin,
}: JoinSessionDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOsxTheme = currentTheme === "macosx";

  const handleJoin = () => {
    const sessionId = extractSessionId(value);
    if (!sessionId) return;
    onJoin(sessionId);
    setValue("");
    onClose();
  };

  const dialogContent = (
    <div className={isXpTheme ? "p-2 px-4" : "p-3"}>
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
        {t("apps.karaoke.liveListen.pasteLinkOrId")}
      </p>
      <Input
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            handleJoin();
          }
        }}
        placeholder={t("apps.karaoke.liveListen.sessionLinkPlaceholder")}
        className={cn(
          "shadow-none h-8",
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
      />
      <DialogFooter className="mt-3 gap-1.5">
        <Button
          variant="retro"
          onClick={onClose}
          className={cn(
            "h-7",
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
          {t("apps.karaoke.liveListen.cancel")}
        </Button>
        <Button
          variant={isMacOsxTheme ? "default" : "retro"}
          onClick={handleJoin}
          className={cn(
            !isMacOsxTheme && "h-7",
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
          {t("apps.karaoke.liveListen.joinButton")}
        </Button>
      </DialogFooter>
    </div>
  );

  if (isXpTheme) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className="p-0 overflow-hidden max-w-xs border-0"
          style={{ fontSize: "11px" }}
          onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
        >
          <div
            className="title-bar"
            style={currentTheme === "xp" ? { minHeight: "30px" } : undefined}
          >
            <div className="title-bar-text">{t("apps.karaoke.liveListen.joinSession")}</div>
            <div className="title-bar-controls">
              <button aria-label="Close" data-action="close" onClick={onClose} />
            </div>
          </div>
          <div className="window-body">{dialogContent}</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="bg-os-window-bg border-[length:var(--os-metrics-border-width)] border-os-window rounded-os shadow-os-window max-w-xs"
        onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
      >
        {isMacOsxTheme ? (
          <>
            <DialogHeader>{t("apps.karaoke.liveListen.joinSession")}</DialogHeader>
            <DialogDescription className="sr-only">
              {t("apps.karaoke.liveListen.pasteLinkOrId")}
            </DialogDescription>
          </>
        ) : (
          <DialogHeader>
            <DialogTitle className="font-normal text-[13px]">
              {t("apps.karaoke.liveListen.joinSession")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("apps.karaoke.liveListen.pasteLinkOrId")}
            </DialogDescription>
          </DialogHeader>
        )}
        {dialogContent}
      </DialogContent>
    </Dialog>
  );
}
