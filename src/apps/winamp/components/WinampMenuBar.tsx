import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarRadioGroup,
  MenubarRadioItem,
} from "@/components/ui/menubar";
import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import { MediaControlsMenu } from "@/components/shared/menubar/MediaControlsMenu";
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
      <MediaControlsMenu
        menuLabel={t("apps.winamp.menu.controls")}
        triggerClassName={MENUBAR_TRIGGER_CLASS}
        isPlaying={isPlaying}
        onTogglePlay={onTogglePlay}
        onPreviousTrack={onPreviousTrack}
        onNextTrack={onNextTrack}
        playLabel={t("apps.winamp.menu.play")}
        pauseLabel={t("apps.winamp.menu.pause")}
        previousLabel={t("apps.winamp.menu.previous")}
        nextLabel={t("apps.winamp.menu.next")}
        shuffleLabel={t("apps.winamp.menu.shuffle")}
        repeatAllLabel={t("apps.winamp.menu.repeat")}
        isShuffled={isShuffleEnabled}
        onToggleShuffle={onToggleShuffle}
        isLoopAll={isRepeatEnabled}
        onToggleLoopAll={onToggleRepeat}
        afterTogglePlayItems={
          <MenubarItem onClick={onStopPlayback} className={MENUBAR_ITEM_CLASS}>
            {t("apps.winamp.menu.stop")}
          </MenubarItem>
        }
      />

    </AppMenuBarShell>
  );
}
