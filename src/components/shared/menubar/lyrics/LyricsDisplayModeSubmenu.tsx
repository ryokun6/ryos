import {
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import { DisplayMode } from "@/types/lyrics";

export type LyricsDisplayModeSubmenuProps = {
  submenuLabel: string;
  displayMode: DisplayMode;
  setDisplayMode: (mode: DisplayMode) => void;
  /** Hidden by the iPod when an Apple Music library is active. */
  includeVideo: boolean;
  videoLabel: string;
  gradientLabel: string;
  waterLabel: string;
  shaderLabel: string;
  landscapesLabel: string;
  coverLabel: string;
};

const DISPLAY_ITEM_CLASS = "text-md h-6 pr-3";

export function LyricsDisplayModeSubmenu({
  submenuLabel,
  displayMode,
  setDisplayMode,
  includeVideo,
  videoLabel,
  gradientLabel,
  waterLabel,
  shaderLabel,
  landscapesLabel,
  coverLabel,
}: LyricsDisplayModeSubmenuProps) {
  const item = (mode: DisplayMode, label: string) => (
    <MenubarCheckboxItem
      checked={displayMode === mode}
      onCheckedChange={(checked) => {
        if (checked) setDisplayMode(mode);
      }}
      className={DISPLAY_ITEM_CLASS}
    >
      {label}
    </MenubarCheckboxItem>
  );

  return (
    <MenubarSub>
      <MenubarSubTrigger className="text-md h-6 px-3">
        {submenuLabel}
      </MenubarSubTrigger>
      <MenubarSubContent className="px-0">
        {includeVideo && item(DisplayMode.Video, videoLabel)}
        {item(DisplayMode.Mesh, gradientLabel)}
        {item(DisplayMode.Water, waterLabel)}
        {item(DisplayMode.Shader, shaderLabel)}
        {item(DisplayMode.Landscapes, landscapesLabel)}
        {item(DisplayMode.Cover, coverLabel)}
      </MenubarSubContent>
    </MenubarSub>
  );
}
