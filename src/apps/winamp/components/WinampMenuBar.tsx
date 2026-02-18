import { MenuBar } from "@/components/layout/MenuBar";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarCheckboxItem,
  MenubarRadioGroup,
  MenubarRadioItem,
} from "@/components/ui/menubar";
import { useThemeStore } from "@/stores/useThemeStore";
import { useTranslation } from "react-i18next";
import { WEBAMP_SKINS } from "../skins";

interface WinampMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  currentSkinUrl: string | null;
  onSkinChange: (url: string | null) => void;
  isPlaying: boolean;
  isShuffleEnabled: boolean;
  isRepeatEnabled: boolean;
  onTogglePlay: () => void;
  onStopPlayback: () => void;
  onPreviousTrack: () => void;
  onNextTrack: () => void;
  onToggleShuffle: () => void;
  onToggleRepeat: () => void;
}

export function WinampMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  currentSkinUrl,
  onSkinChange,
  isPlaying,
  isShuffleEnabled,
  isRepeatEnabled,
  onTogglePlay,
  onStopPlayback,
  onPreviousTrack,
  onNextTrack,
  onToggleShuffle,
  onToggleRepeat,
}: WinampMenuBarProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98" || currentTheme === "win7";
  const isMacOsxTheme = currentTheme === "macosx";

  return (
    <MenuBar inWindowFrame={isXpTheme}>
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem onClick={onClose} className="text-md h-6 px-3">
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("apps.winamp.menu.skins")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarRadioGroup
            value={currentSkinUrl ?? "default"}
            onValueChange={(value) =>
              onSkinChange(value === "default" ? null : value)
            }
          >
            <MenubarRadioItem
              value="default"
              className="text-md h-6 pr-3"
            >
              {t("apps.winamp.skins.default")}
            </MenubarRadioItem>
            <MenubarSeparator className="h-[2px] bg-black my-1" />
            {WEBAMP_SKINS.map((skin) => (
              <MenubarRadioItem
                key={skin.url}
                value={skin.url}
                className="text-md h-6 pr-3"
              >
                {skin.name}
              </MenubarRadioItem>
            ))}
          </MenubarRadioGroup>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("apps.winamp.menu.controls", { defaultValue: "Controls" })}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onTogglePlay}
            className="text-md h-6 px-3"
          >
            {isPlaying
              ? t("apps.winamp.menu.pause", { defaultValue: "Pause" })
              : t("apps.winamp.menu.play", { defaultValue: "Play" })}
          </MenubarItem>
          <MenubarItem
            onClick={onStopPlayback}
            className="text-md h-6 px-3"
          >
            {t("apps.winamp.menu.stop", { defaultValue: "Stop" })}
          </MenubarItem>
          <MenubarItem
            onClick={onPreviousTrack}
            className="text-md h-6 px-3"
          >
            {t("apps.winamp.menu.previous", { defaultValue: "Previous" })}
          </MenubarItem>
          <MenubarItem
            onClick={onNextTrack}
            className="text-md h-6 px-3"
          >
            {t("apps.winamp.menu.next", { defaultValue: "Next" })}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarCheckboxItem
            checked={isShuffleEnabled}
            onCheckedChange={() => onToggleShuffle()}
            className="text-md h-6 px-3"
          >
            {t("apps.winamp.menu.shuffle", { defaultValue: "Shuffle" })}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={isRepeatEnabled}
            onCheckedChange={() => onToggleRepeat()}
            className="text-md h-6 px-3"
          >
            {t("apps.winamp.menu.repeat", { defaultValue: "Repeat" })}
          </MenubarCheckboxItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem onClick={onShowHelp} className="text-md h-6 px-3">
            {t("apps.winamp.menu.help")}
          </MenubarItem>
          {!isMacOsxTheme && (
            <>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarItem onClick={onShowAbout} className="text-md h-6 px-3">
                {t("apps.winamp.menu.about")}
              </MenubarItem>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>
    </MenuBar>
  );
}
