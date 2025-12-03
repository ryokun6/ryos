import React from "react";
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

interface InputDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: string) => void;
  title: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  isLoading?: boolean;
  errorMessage?: string | null;
  // Additional actions support
  additionalActions?: Array<{
    label: string;
    onClick: () => void;
    variant?: "retro" | "destructive";
    position?: "left" | "right";
  }>;
  submitLabel?: string;
  showCancel?: boolean;
}

export function InputDialog({
  isOpen,
  onOpenChange,
  onSubmit,
  title,
  description,
  value,
  onChange,
  isLoading = false,
  errorMessage = null,
  additionalActions = [],
  submitLabel,
  showCancel = true,
}: InputDialogProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacTheme = currentTheme === "macosx";
  const defaultSubmitLabel = submitLabel || t("common.dialog.save");

  const handleSubmit = () => {
    if (!isLoading) {
      onSubmit(value);
    }
  };

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
        {description}
      </p>
      <Input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && !isLoading) {
            handleSubmit();
          }
        }}
        className={cn(
          "shadow-none",
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
        disabled={isLoading}
      />
      {errorMessage && (
        <p className="text-red-600 text-sm mt-1">{errorMessage}</p>
      )}
      <DialogFooter className="mt-4 gap-1 sm:justify-between">
        <div className="flex gap-1 w-full sm:w-auto">
          {additionalActions
            .filter((action) => action.position === "left")
            .map((action, index) => (
              <Button
                key={`left-${index}`}
                variant={action.variant || "retro"}
                onClick={action.onClick}
                disabled={isLoading}
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
                {action.label}
              </Button>
            ))}
        </div>
        <div className="flex flex-col-reverse gap-2 w-full sm:w-auto sm:flex-row">
          {additionalActions
            .filter((action) => action.position !== "left")
            .map((action, index) => (
              <Button
                key={`right-${index}`}
                variant={action.variant || "retro"}
                onClick={action.onClick}
                disabled={isLoading}
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
                {action.label}
              </Button>
            ))}
          {showCancel && (
            <Button
              variant={isMacTheme ? "secondary" : "retro"}
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
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
          )}
          <Button
            variant={isMacTheme ? "default" : "retro"}
            onClick={handleSubmit}
            disabled={isLoading}
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
            {isLoading ? t("common.dialog.adding") : defaultSubmitLabel}
          </Button>
        </div>
      </DialogFooter>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("max-w-[500px]", isXpTheme && "p-0 overflow-hidden")}
        style={isXpTheme ? { fontSize: "11px" } : undefined}
        onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
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
