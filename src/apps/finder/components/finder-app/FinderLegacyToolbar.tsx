import type { RefObject, ChangeEvent, KeyboardEvent, DragEvent } from "react";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { TFunction } from "i18next";

export interface FinderLegacyToolbarProps {
  t: TFunction;
  isXpTheme: boolean;
  currentTheme: string;
  isAirDropView: boolean;
  currentPath: string;
  pathInputRef: RefObject<HTMLInputElement | null>;
  displayPath: string;
  canNavigateBack: () => boolean;
  canNavigateForward: () => boolean;
  navigateBack: () => void;
  navigateForward: () => void;
  navigateAwayFromAirDrop: () => void;
  navigateUp: () => void;
  handlePathInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handlePathInputKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  handleParentButtonDragOver: (e: DragEvent<HTMLButtonElement>) => void;
  handleParentButtonDragLeave: (e: DragEvent<HTMLButtonElement>) => void;
  handleParentButtonDrop: (e: DragEvent<HTMLButtonElement>) => void;
}

export function FinderLegacyToolbar({
  t,
  isXpTheme,
  currentTheme,
  isAirDropView,
  currentPath,
  pathInputRef,
  displayPath,
  canNavigateBack,
  canNavigateForward,
  navigateBack,
  navigateForward,
  navigateAwayFromAirDrop,
  navigateUp,
  handlePathInputChange,
  handlePathInputKeyDown,
  handleParentButtonDragOver,
  handleParentButtonDragLeave,
  handleParentButtonDrop,
}: FinderLegacyToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 p-1",
        isXpTheme
          ? "border-b border-[#919b9c]"
          : currentTheme === "system7"
            ? "bg-neutral-100 border-b border-black"
            : "bg-neutral-100 border-b border-neutral-300"
      )}
      style={{
        background: isXpTheme ? "transparent" : undefined,
      }}
    >
      <div className="flex gap-2 items-center">
        <div className="flex gap-0 items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (isAirDropView) {
                navigateAwayFromAirDrop();
              } else {
                navigateBack();
              }
            }}
            disabled={!isAirDropView && !canNavigateBack()}
            className="size-8"
          >
            <ArrowLeft size={14} weight="bold" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={navigateForward}
            disabled={!canNavigateForward()}
            className="size-8"
          >
            <ArrowRight size={14} weight="bold" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={navigateUp}
            disabled={currentPath === "/"}
            className="size-8"
            onDragOver={handleParentButtonDragOver}
            onDragLeave={handleParentButtonDragLeave}
            onDrop={handleParentButtonDrop}
          >
            <ArrowLeft size={14} className="rotate-90" weight="bold" />
          </Button>
        </div>
        <Input
          ref={pathInputRef}
          value={displayPath}
          onChange={handlePathInputChange}
          onKeyDown={handlePathInputKeyDown}
          className={cn("flex-1 pl-2", isXpTheme ? "!text-[11px]" : "!text-[16px]")}
          placeholder={t("apps.finder.placeholders.enterPath")}
        />
      </div>
    </div>
  );
}
