import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useThemeStore } from "@/stores/useThemeStore";
import { cn } from "@/lib/utils";

interface ListenSessionInviteProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  appType: "ipod" | "karaoke";
}

export function ListenSessionInvite({
  isOpen,
  onClose,
  sessionId,
  appType,
}: ListenSessionInviteProps) {
  const { t } = useTranslation();
  const [shareUrl, setShareUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOsxTheme = currentTheme === "macosx";

  const baseUrl = useMemo(() => {
    if (typeof window !== "undefined") {
      return window.location.origin;
    }
    return "https://os.ryo.lu";
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setShareUrl("");
      return;
    }
    setShareUrl(`${baseUrl}/listen/${sessionId}?app=${appType}`);
  }, [appType, baseUrl, isOpen, sessionId]);

  useEffect(() => {
    if (shareUrl && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [shareUrl]);

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied", {
        description: "Share the link to invite friends.",
      });
      onClose();
    } catch {
      toast.error("Copy failed", {
        description: "Select the link and copy manually.",
      });
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  const dialogContent = (
    <div className={isXpTheme ? "p-2 px-4" : "p-3"}>
      <div className="flex flex-col items-center space-y-3 w-full">
        <div className="bg-white p-1.5 w-32 h-32 flex items-center justify-center">
          <QRCodeSVG
            value={shareUrl || "placeholder"}
            size={112}
            level="M"
            includeMargin={false}
            className="w-28 h-28"
          />
        </div>
        <p
          className={cn(
            "text-neutral-500 text-center",
            isXpTheme
              ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[10px]"
              : "font-geneva-12 text-xs"
          )}
          style={{
            fontFamily: isXpTheme
              ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
              : undefined,
            fontSize: isXpTheme ? "10px" : undefined,
          }}
        >
          {t("apps.karaoke.liveListen.shareLinkInvite")}
        </p>

        <Input
          ref={inputRef}
          value={shareUrl}
          readOnly
          className={cn(
            "shadow-none h-8 w-full",
            isXpTheme
              ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
              : "text-sm"
          )}
          style={{
            fontFamily: isXpTheme
              ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
              : undefined,
            fontSize: isXpTheme ? "11px" : undefined,
          }}
        />
      </div>

      <DialogFooter className="mt-3 flex justify-end">
        <Button
          variant="retro"
          onClick={handleCopy}
          className={cn(
            "h-7 w-full",
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
          {t("apps.karaoke.liveListen.copyLink")}
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
            <div className="title-bar-text">{t("apps.karaoke.liveListen.inviteToListen")}</div>
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
            <DialogHeader>{t("apps.karaoke.liveListen.inviteToListen")}</DialogHeader>
            <DialogDescription className="sr-only">
              {t("apps.karaoke.liveListen.shareLinkInvite")}
            </DialogDescription>
          </>
        ) : (
          <DialogHeader>
            <DialogTitle className="font-normal text-[13px]">
              {t("apps.karaoke.liveListen.inviteToListen")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("apps.karaoke.liveListen.shareLinkInvite")}
            </DialogDescription>
          </DialogHeader>
        )}
        {dialogContent}
      </DialogContent>
    </Dialog>
  );
}
