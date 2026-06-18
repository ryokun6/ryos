import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
} from "@/components/ui/menubar";
import { Slider } from "@/components/ui/slider";
import {
  SpeakerSimpleLow,
  SpeakerSimpleHigh,
  SpeakerSimpleSlash,
  Gear,
} from "@phosphor-icons/react";
import { useSound, Sounds } from "@/hooks/useSound";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useAudioSettingsStoreShallow } from "@/stores/useAudioSettingsStore";

const MENU_VALUE = "volume";

export function VolumeControl() {
  const { masterVolume, setMasterVolume } = useAudioSettingsStoreShallow((s) => ({
    masterVolume: s.masterVolume,
    setMasterVolume: s.setMasterVolume,
  }));
  const { t } = useTranslation();
  const { play: playVolumeChangeSound } = useSound(Sounds.VOLUME_CHANGE);
  const launchApp = useLaunchApp();
  const [menuValue, setMenuValue] = useState("");
  const { isWindowsTheme, isWin98 } = useThemeFlags();

  const volumeLabel = t("common.menuBar.volume", "Volume");

  const getVolumeIcon = () => {
    if (masterVolume === 0) {
      return <SpeakerSimpleSlash size={12} weight="fill" />;
    }
    if (masterVolume < 0.5) {
      return <SpeakerSimpleLow size={12} weight="fill" />;
    }
    return <SpeakerSimpleHigh size={12} weight="fill" />;
  };

  return (
    <Menubar
      value={menuValue}
      onValueChange={setMenuValue}
      className={`hidden sm:flex items-stretch self-stretch border-none bg-transparent p-0 space-x-0 rounded-none h-full ${
        isWindowsTheme ? "" : "mr-2"
      }`}
    >
      <MenubarMenu value={MENU_VALUE}>
        <MenubarTrigger
          className="flex items-center justify-center px-2 border-none focus-visible:ring-0"
          title={volumeLabel}
          aria-label={volumeLabel}
          style={{ color: isWindowsTheme && isWin98 ? "#000000" : undefined }}
        >
          {getVolumeIcon()}
        </MenubarTrigger>
        <MenubarContent
          align="center"
          side={isWindowsTheme ? "top" : "bottom"}
          sideOffset={isWindowsTheme ? 8 : 1}
          className="w-auto min-w-4 h-40 flex flex-col items-center justify-center"
          style={{ minWidth: "auto" }}
        >
          <Slider
            orientation="vertical"
            min={0}
            max={1}
            step={0.05}
            value={[masterVolume]}
            onValueChange={(v) => setMasterVolume(v[0])}
            onValueCommit={playVolumeChangeSound}
          />
          <MenubarItem
            className="mt-2 h-6 w-6 p-0 flex items-center justify-center"
            onSelect={() => {
              setMenuValue("");
              launchApp("control-panels", {
                initialData: { defaultTab: "sound" },
              });
            }}
          >
            <Gear className="h-4 w-4" weight="bold" />
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}
