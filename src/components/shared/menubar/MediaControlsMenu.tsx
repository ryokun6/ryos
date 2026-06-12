import type { ReactNode } from "react";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import { MENUBAR_SEPARATOR_CLASS } from "./menubarStyles";

export type MediaControlsMenuProps = {
  menuLabel: string;
  triggerClassName?: string;
  /** When provided, transport items are disabled while the library is empty. */
  tracksCount?: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onPreviousTrack: () => void;
  onNextTrack: () => void;
  playLabel: string;
  pauseLabel: string;
  previousLabel: string;
  nextLabel: string;
  shuffleLabel: string;
  repeatAllLabel: string;
  /** Omit (with isLoopCurrent/onToggleLoopCurrent) for apps with a single repeat toggle. */
  repeatOneLabel?: string;
  isShuffled: boolean;
  onToggleShuffle: () => void;
  isLoopAll: boolean;
  onToggleLoopAll: () => void;
  isLoopCurrent?: boolean;
  onToggleLoopCurrent?: () => void;
  /** Extra items rendered between play/pause and previous (e.g. Winamp's Stop). */
  afterTogglePlayItems?: ReactNode;
  /** Extra items rendered between the transport items and the shuffle/repeat block. */
  extraItems?: ReactNode;
};

export function MediaControlsMenu({
  menuLabel,
  triggerClassName = "px-2 py-1 text-md focus-visible:ring-0",
  tracksCount,
  isPlaying,
  onTogglePlay,
  onPreviousTrack,
  onNextTrack,
  playLabel,
  pauseLabel,
  previousLabel,
  nextLabel,
  shuffleLabel,
  repeatAllLabel,
  repeatOneLabel,
  isShuffled,
  onToggleShuffle,
  isLoopAll,
  onToggleLoopAll,
  isLoopCurrent,
  onToggleLoopCurrent,
  afterTogglePlayItems,
  extraItems,
}: MediaControlsMenuProps) {
  const tracksDisabled = tracksCount === 0;

  return (
    <MenubarMenu>
      <MenubarTrigger className={triggerClassName}>{menuLabel}</MenubarTrigger>
      <MenubarContent align="start" sideOffset={1} className="px-0">
        <MenubarItem
          onClick={onTogglePlay}
          className="text-md h-6 px-3"
          disabled={tracksDisabled}
        >
          {isPlaying ? pauseLabel : playLabel}
        </MenubarItem>
        {afterTogglePlayItems}
        <MenubarItem
          onClick={onPreviousTrack}
          className="text-md h-6 px-3"
          disabled={tracksDisabled}
        >
          {previousLabel}
        </MenubarItem>
        <MenubarItem
          onClick={onNextTrack}
          className="text-md h-6 px-3"
          disabled={tracksDisabled}
        >
          {nextLabel}
        </MenubarItem>
        {extraItems}
        <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
        <MenubarCheckboxItem
          checked={isShuffled}
          onCheckedChange={onToggleShuffle}
          className="text-md h-6 px-3"
        >
          {shuffleLabel}
        </MenubarCheckboxItem>
        <MenubarCheckboxItem
          checked={isLoopAll}
          onCheckedChange={onToggleLoopAll}
          className="text-md h-6 px-3"
        >
          {repeatAllLabel}
        </MenubarCheckboxItem>
        {onToggleLoopCurrent && (
          <MenubarCheckboxItem
            checked={isLoopCurrent ?? false}
            onCheckedChange={onToggleLoopCurrent}
            className="text-md h-6 px-3"
          >
            {repeatOneLabel}
          </MenubarCheckboxItem>
        )}
      </MenubarContent>
    </MenubarMenu>
  );
}
