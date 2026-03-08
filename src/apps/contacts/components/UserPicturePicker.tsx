import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useThemeStore } from "@/stores/useThemeStore";
import { cn } from "@/lib/utils";
import { ALL_USER_PICTURES } from "@/utils/userPictures";

interface UserPicturePickerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  currentPicture: string | null;
  onSelect: (picturePath: string | null) => void;
}

export function UserPicturePicker({
  isOpen,
  onOpenChange,
  currentPicture,
  onSelect,
}: UserPicturePickerProps) {
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacTheme = currentTheme === "macosx";

  const fontClassName = isXpTheme
    ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
    : "font-geneva-12 text-[12px]";

  const fontStyle = isXpTheme
    ? { fontFamily: '"Pixelated MS Sans Serif", "ArkPixel", Arial', fontSize: "11px" }
    : undefined;

  const handleSelect = (path: string) => {
    onSelect(path);
    onOpenChange(false);
  };

  const handleClear = () => {
    onSelect(null);
    onOpenChange(false);
  };

  const title = "Choose Picture";

  const dialogContent = (
    <div className={isXpTheme ? "p-2 px-4" : "p-4 px-6"}>
      <div
        className="grid grid-cols-4 gap-2 overflow-y-auto pr-1"
        style={{ maxHeight: "320px" }}
      >
        {ALL_USER_PICTURES.map((picture) => (
          <button
            key={picture.id}
            type="button"
            onClick={() => handleSelect(picture.path)}
            className={cn(
              "relative rounded-[6px] border-2 overflow-hidden transition-all hover:scale-105 focus:outline-none",
              currentPicture === picture.path
                ? "border-blue-500 shadow-[0_0_0_1px_rgba(59,130,246,0.5)]"
                : "border-transparent hover:border-black/20"
            )}
            title={picture.name}
          >
            <div style={{ paddingBottom: "100%" }} />
            <img
              src={picture.path}
              alt={picture.name}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>
      <DialogFooter className="mt-4 gap-1 sm:justify-between">
        <div className="flex gap-1 w-full sm:w-auto">
          {currentPicture && (
            <Button
              variant="retro"
              onClick={handleClear}
              className={cn("w-full sm:w-auto h-7", fontClassName)}
              style={fontStyle}
            >
              Remove
            </Button>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 w-full sm:w-auto sm:flex-row">
          <Button
            variant={isMacTheme ? "secondary" : "retro"}
            onClick={() => onOpenChange(false)}
            className={cn("w-full sm:w-auto", !isMacTheme && "h-7", fontClassName)}
            style={fontStyle}
          >
            Cancel
          </Button>
        </div>
      </DialogFooter>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("max-w-[380px]", isXpTheme && "p-0 overflow-hidden")}
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
                Select a picture for this contact
              </DialogDescription>
            </DialogHeader>
            {dialogContent}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
