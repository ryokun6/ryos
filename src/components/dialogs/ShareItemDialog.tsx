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

interface ShareItemDialogProps {
  isOpen: boolean;
  onClose: () => void;
  itemType: string; // e.g., "Page", "Song", "Item"
  itemIdentifier: string; // e.g., URL for IE, videoId for iPod
  secondaryIdentifier?: string; // e.g., year for IE
  title?: string; // e.g., Webpage title, Song title
  details?: string; // e.g., Artist for Song
  generateShareUrl: (identifier: string, secondary?: string) => string;
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
}: ShareItemDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOsxTheme = currentTheme === "macosx";

  // Generate the share link when the dialog opens or identifiers change
  useEffect(() => {
    if (isOpen && itemIdentifier) {
      setIsLoading(true);
      try {
        const generated = generateShareUrl(itemIdentifier, secondaryIdentifier);
        setShareUrl(generated);
      } catch (error) {
        console.error("Error generating share link:", error);
        toast.error(`Failed to generate share link for ${itemType}`, {
          description: "Please try again later",
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
  }, [isOpen, itemIdentifier, secondaryIdentifier, itemType, generateShareUrl]);

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
        toast.success("Link copied", {
          description: `${itemType} link copied to clipboard`,
        });
        onClose(); // Dismiss the dialog after copying
      } catch (err) {
        console.error("Failed to copy text: ", err);
        toast.error("Failed to copy link", {
          description:
            "Could not copy to clipboard. Please try manually selecting and copying.",
        });
        // Fallback for older browsers or if permission denied, select the text
        inputRef.current.focus();
        inputRef.current.select();
      }
    }
  };


  // Construct the descriptive text
  const descriptionText = () => {
    let text = `Share link or scan to open this ${itemType.toLowerCase()}`; // Start with basic type
    if (title) {
      text += `: ${title}`;
    }
    if (details) {
      text += ` by ${details}`;
    }
    if (secondaryIdentifier) {
      // Handle year specifically for now, could be made more generic
      if (itemType === "Page" && secondaryIdentifier !== "current") {
        text += ` from ${secondaryIdentifier}`;
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
                  ? '"Pixelated MS Sans Serif", Arial'
                  : undefined,
                fontSize: isXpTheme ? "10px" : undefined,
              }}
            >
              Generating...
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
                  ? '"Pixelated MS Sans Serif", Arial'
                  : undefined,
                fontSize: isXpTheme ? "10px" : undefined,
              }}
            >
              QR code
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
              ? '"Pixelated MS Sans Serif", Arial'
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
              ? '"Pixelated MS Sans Serif", Arial'
              : undefined,
            fontSize: isXpTheme ? "11px" : undefined,
          }}
          placeholder={
            isLoading
              ? "Generating..."
              : `Share link for ${itemType.toLowerCase()}`
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
              ? '"Pixelated MS Sans Serif", Arial'
              : undefined,
            fontSize: isXpTheme ? "11px" : undefined,
          }}
        >
          Copy Link
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
            currentTheme === "xp" ? "window" : "window" // Use window class for both themes
          )}
          style={{
            fontSize: "11px",
          }}
          onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
        >
          <div
            className="title-bar"
            style={currentTheme === "xp" ? { minHeight: "30px" } : undefined}
          >
            <div className="title-bar-text">Share {itemType}</div>
            <div className="title-bar-controls">
              <button aria-label="Close" onClick={onClose} />
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
            <DialogHeader>Share {itemType}</DialogHeader>
            <DialogDescription className="sr-only">
              Share this {itemType.toLowerCase()} via link or QR code
            </DialogDescription>
          </>
        ) : (
          <DialogHeader>
            <DialogTitle className="font-normal text-[16px]">
              Share {itemType}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Share this {itemType.toLowerCase()} via link or QR code
            </DialogDescription>
          </DialogHeader>
        )}
        {dialogContent}
      </DialogContent>
    </Dialog>
  );
}
