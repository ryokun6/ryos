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
import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  MENUBAR_ITEM_CLASS,
  MENUBAR_SEPARATOR_CLASS,
  MENUBAR_TRIGGER_CLASS,
} from "@/components/shared/menubar/menubarStyles";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
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
  const {
    isShareDialogOpen,
    setIsShareDialogOpen,
    isXpTheme,
    isMacOsxTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("winamp");

  return (
    <AppMenuBarShell
      isXpTheme={isXpTheme}
      isMacOsxTheme={isMacOsxTheme}
      appId={appId}
      appName={appName}
      isShareDialogOpen={isShareDialogOpen}
      setIsShareDialogOpen={setIsShareDialogOpen}
      helpItemLabel={t("apps.winamp.menu.help")}
      aboutItemLabel={t("apps.winamp.menu.about")}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
    >
      <MenubarMenu>
        <MenubarTrigger className={MENUBAR_TRIGGER_CLASS}>
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem onClick={onClose} className={MENUBAR_ITEM_CLASS}>
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className={MENUBAR_TRIGGER_CLASS}>
          {t("apps.winamp.menu.skins")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarRadioGroup
            value={currentSkinUrl ?? "default"}
            onValueChange={(value) =>
              onSkinChange(value === "default" ? null : value)
            }
          >
            <MenubarRadioItem value="default" className="text-md h-6 pr-3">
              {t("apps.winamp.skins.default")}
            </MenubarRadioItem>
            <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
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
        <MenubarTrigger className={MENUBAR_TRIGGER_CLASS}>
          {t("apps.winamp.menu.controls")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem onClick={onTogglePlay} className={MENUBAR_ITEM_CLASS}>
            {isPlaying
              ? t("apps.winamp.menu.pause")
              : t("apps.winamp.menu.play")}
          </MenubarItem>
          <MenubarItem onClick={onStopPlayback} className={MENUBAR_ITEM_CLASS}>
            {t("apps.winamp.menu.stop")}
          </MenubarItem>
          <MenubarItem onClick={onPreviousTrack} className={MENUBAR_ITEM_CLASS}>
            {t("apps.winamp.menu.previous")}
          </MenubarItem>
          <MenubarItem onClick={onNextTrack} className={MENUBAR_ITEM_CLASS}>
            {t("apps.winamp.menu.next")}
          </MenubarItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarCheckboxItem
            checked={isShuffleEnabled}
            onCheckedChange={() => onToggleShuffle()}
            className={MENUBAR_ITEM_CLASS}
          >
            {t("apps.winamp.menu.shuffle")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={isRepeatEnabled}
            onCheckedChange={() => onToggleRepeat()}
            className={MENUBAR_ITEM_CLASS}
          >
            {t("apps.winamp.menu.repeat")}
          </MenubarCheckboxItem>
        </MenubarContent>
      </MenubarMenu>

    </AppMenuBarShell>
  );
}
