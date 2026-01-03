import React, { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useThemeStore } from "@/stores/useThemeStore";
import { cn } from "@/lib/utils";
import { QRCodeSVG } from "qrcode.react";
import { useTranslation } from "react-i18next";

interface ShareItemDialogProps {
  isOpen: boolean;
  onClose: () => void;
  itemType: string; // e.g., "Page", "Song", "Item"
  itemIdentifier: string; // e.g., URL for IE, videoId for iPod
  secondaryIdentifier?: string; // e.g., year for IE
  title?: string; // e.g., Webpage title, Song title
  details?: string; // e.g., Artist for Song
  generateShareUrl: (identifier: string, secondary?: string) => string;
  contentClassName?: string; // Additional className for DialogContent (e.g., for z-index overrides)
  overlayClassName?: string; // Additional className for Dialog overlay (e.g., for z-index overrides)
}

export function ShareItemDialog({
  isOpen,
  onClose,
  itemType,
  itemIdentifier,
  secondaryIdentifier,
  title,
  details,
  generateShareUrl,
  contentClassName,
  overlayClassName,
}: ShareItemDialogProps) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOsxTheme = currentTheme === "macosx";

  // Translate itemType (e.g., "Page" -> translated "Page", "Song" -> translated "Song")
  const translatedItemType = t(`common.dialog.share.itemTypes.${itemType.toLowerCase()}`, { defaultValue: itemType });

  // Generate the share link when the dialog opens or identifiers change
  useEffect(() => {
    if (isOpen && itemIdentifier) {
      setIsLoading(true);
      try {
        const generated = generateShareUrl(itemIdentifier, secondaryIdentifier);
        setShareUrl(generated);
      } catch (error) {
        console.error("Error generating share link:", error);
        toast.error(t("common.dialog.share.failedToGenerateShareLink", { itemType: translatedItemType }), {
          description: t("common.dialog.share.pleaseTryAgainLater"),
        });
        setShareUrl(""); // Clear potentially stale URL
      } finally {
        setIsLoading(false);
      }
    }
    return () => {
      // Reset state when dialog closes
      if (!isOpen) {
        setShareUrl("");
      }
    };
    // Include all dependencies that affect URL generation
  }, [isOpen, itemIdentifier, secondaryIdentifier, itemType, generateShareUrl, t]);

  // Focus the input when the share URL is available
  useEffect(() => {
    if (shareUrl && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      inputRef.current.scrollLeft = 0;
    }
  }, [shareUrl]);

  const handleCopyToClipboard = async () => {
    if (inputRef.current && shareUrl) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success(t("common.dialog.share.linkCopied"), {
          description: t("common.dialog.share.linkCopiedToClipboard", { itemType: translatedItemType }),
        });
        onClose(); // Dismiss the dialog after copying
      } catch (err) {
        console.error("Failed to copy text: ", err);
        toast.error(t("common.dialog.share.failedToCopyLink"), {
          description: t("common.dialog.share.couldNotCopyToClipboard"),
        });
        // Fallback for older browsers or if permission denied, select the text
        inputRef.current.focus();
        inputRef.current.select();
      }
    }
  };


  // Construct the descriptive text
  const descriptionText = () => {
    let text = t("common.dialog.share.shareLinkOrScanToOpen", { itemType: translatedItemType.toLowerCase() }); // Start with basic type
    if (title) {
      text += `: ${title}`;
    }
    if (details) {
      text += ` ${t("common.dialog.share.by")} ${details}`;
    }
    if (secondaryIdentifier) {
      // Handle year specifically for now, could be made more generic
      if (itemType === "Page" && secondaryIdentifier !== "current") {
        text += ` ${t("common.dialog.share.from")} ${secondaryIdentifier}`;
      }
    }
    return text;
  };

  const dialogContent = (
    <div className="p-3 w-full">
      <div className="flex flex-col items-center space-y-3 w-full">
        {/* QR Code */}
        {isLoading ? (
          <div className="w-32 h-32 flex items-center justify-center bg-gray-100 rounded">
            <p
              className={cn(
                "text-gray-500",
                isXpTheme
                  ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[10px]"
                  : "font-geneva-12 text-[10px]"
              )}
              style={{
                fontFamily: isXpTheme
                  ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                  : undefined,
                fontSize: isXpTheme ? "10px" : undefined,
              }}
            >
              {t("common.dialog.share.generating")}
            </p>
          </div>
        ) : shareUrl ? (
          <div className="bg-white p-1.5 w-32 h-32 flex items-center justify-center">
            <QRCodeSVG
              value={shareUrl}
              size={112}
              level="M"
              includeMargin={false}
              className="w-28 h-28"
            />
          </div>
        ) : (
          <div className="w-32 h-32 flex items-center justify-center bg-gray-100 rounded">
            <p
              className={cn(
                "text-gray-500",
                isXpTheme
                  ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[10px]"
                  : "font-geneva-12 text-[10px]"
              )}
              style={{
                fontFamily: isXpTheme
                  ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                  : undefined,
                fontSize: isXpTheme ? "10px" : undefined,
              }}
            >
              {t("common.dialog.share.qrCode")}
            </p>
          </div>
        )}
        {/* Descriptive text below QR code */}
        <p
          className={cn(
            "text-neutral-500 text-center mt-0 mb-4 break-words w-[80%]",
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
          {descriptionText()}
        </p>

        {/* URL Input */}
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
          placeholder={
            isLoading
              ? t("common.dialog.share.generating")
              : t("common.dialog.share.shareLinkFor", { itemType: translatedItemType.toLowerCase() })
          }
        />
      </div>

      <DialogFooter className="mt-2 flex justify-end gap-1">
        <Button
          onClick={handleCopyToClipboard}
          disabled={!shareUrl || isLoading}
          variant="retro"
          className={cn(
            "w-full h-7",
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
          {t("common.dialog.share.copyLink")}
        </Button>
      </DialogFooter>
    </div>
  );

  if (isXpTheme) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className={cn(
            "p-0 overflow-hidden max-w-xs border-0", // Remove border but keep box-shadow
            currentTheme === "xp" ? "window" : "window", // Use window class for both themes
            contentClassName
          )}
          overlayClassName={overlayClassName}
          style={{
            fontSize: "11px",
          }}
          onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
        >
          <div
            className="title-bar"
            style={currentTheme === "xp" ? { minHeight: "30px" } : undefined}
          >
            <div className="title-bar-text">{t("common.dialog.share.shareItem", { itemType: translatedItemType })}</div>
            <div className="title-bar-controls">
              <button aria-label={t("common.menu.close")} data-action="close" onClick={onClose} />
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
        className={cn(
          "bg-os-window-bg border-[length:var(--os-metrics-border-width)] border-os-window rounded-os shadow-os-window max-w-xs",
          contentClassName
        )}
        overlayClassName={overlayClassName}
        onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
      >
        {isMacOsxTheme ? (
          <>
            <DialogHeader>{t("common.dialog.share.shareItem", { itemType: translatedItemType })}</DialogHeader>
            <DialogDescription className="sr-only">
              {t("common.dialog.share.shareItemViaLinkOrQrCode", { itemType: translatedItemType.toLowerCase() })}
            </DialogDescription>
          </>
        ) : (
          <DialogHeader>
            <DialogTitle className="font-normal text-[16px]">
              {t("common.dialog.share.shareItem", { itemType: translatedItemType })}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("common.dialog.share.shareItemViaLinkOrQrCode", { itemType: translatedItemType.toLowerCase() })}
            </DialogDescription>
          </DialogHeader>
        )}
        {dialogContent}
      </DialogContent>
    </Dialog>
  );
}
