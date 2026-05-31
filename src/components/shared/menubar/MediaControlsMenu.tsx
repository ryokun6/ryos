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
  tracksCount: number;
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
  repeatOneLabel: string;
  isShuffled: boolean;
  onToggleShuffle: () => void;
  isLoopAll: boolean;
  onToggleLoopAll: () => void;
  isLoopCurrent: boolean;
  onToggleLoopCurrent: () => void;
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
        <MenubarCheckboxItem
          checked={isLoopCurrent}
          onCheckedChange={onToggleLoopCurrent}
          className="text-md h-6 px-3"
        >
          {repeatOneLabel}
        </MenubarCheckboxItem>
      </MenubarContent>
    </MenubarMenu>
  );
}
