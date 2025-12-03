import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRef, useEffect } from "react";
import { useSound, Sounds } from "@/hooks/useSound";
import { useThemeStore } from "@/stores/useThemeStore";
import { cn } from "@/lib/utils";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { useTranslation } from "react-i18next";

interface ConfirmDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
}

export function ConfirmDialog({
  isOpen,
  onOpenChange,
  onConfirm,
  title,
  description,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const { play: playAlertSound } = useSound(Sounds.ALERT_SOSUMI);
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacTheme = currentTheme === "macosx";

  // Play sound when dialog opens
  useEffect(() => {
    if (isOpen) {
      playAlertSound();
    }
  }, [isOpen, playAlertSound]);

  const dialogContent = (
    <div className={isXpTheme ? "p-2 px-4" : "p-6"}>
      <div className="flex gap-3 items-start">
        <ThemedIcon
          name="warn.png"
          alt="Warning"
          className="w-[32px] h-[32px] mt-0.5 [image-rendering:pixelated]"
          width={32}
          height={32}
        />
        <p
          className={cn(
            "text-gray-900 mb-2 leading-tight",
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
          {description}
        </p>
      </div>
      <DialogFooter className="mt-2 gap-1.5">
        <Button
          variant="retro"
          onClick={() => onOpenChange(false)}
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
          {t("common.dialog.cancel")}
        </Button>
        <Button
          variant={isMacTheme ? "default" : "retro"}
          onClick={onConfirm}
          ref={confirmButtonRef}
          className={cn(
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
          {t("common.dialog.confirm")}
        </Button>
      </DialogFooter>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("max-w-[400px]", isXpTheme && "p-0 overflow-hidden")}
        style={isXpTheme ? { fontSize: "11px" } : undefined}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          confirmButtonRef.current?.focus();
        }}
      >
        {isXpTheme ? (
          <>
            <DialogHeader>{title}</DialogHeader>
            <div className="window-body">{dialogContent}</div>
          </>
        ) : currentTheme === "macosx" ? (
          <>
            <DialogHeader>{title}</DialogHeader>
            {dialogContent}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-normal text-[16px]">
                {title}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {description}
              </DialogDescription>
            </DialogHeader>
            {dialogContent}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
