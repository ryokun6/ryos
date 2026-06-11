import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { SpeakerSimpleLow, SpeakerSimpleHigh, SpeakerSimpleSlash, Gear } from "@phosphor-icons/react";
import { useSound, Sounds } from "@/hooks/useSound";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useAudioSettingsStoreShallow } from "@/stores/useAudioSettingsStore";

export function VolumeControl() {
  const { masterVolume, setMasterVolume } = useAudioSettingsStoreShallow((s) => ({
    masterVolume: s.masterVolume,
    setMasterVolume: s.setMasterVolume,
  }));
  const { play: playVolumeChangeSound } = useSound(Sounds.VOLUME_CHANGE);
  const launchApp = useLaunchApp();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const { isWindowsTheme: isXpTheme, isWin98 } = useThemeFlags();

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
    <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-6 w-7 text-md px-1 py-1 border-none focus-visible:ring-0 ${
            isXpTheme
              ? "hover:bg-white/20 active:bg-white/30"
              : "hover:bg-black/10 active:bg-black/20"
          } ${isXpTheme ? "" : "mr-2"}`}
          style={{
            color:
              isXpTheme && isWin98 ? "#000000" : "inherit",
          }}
        >
          {getVolumeIcon()}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        side={isXpTheme ? "top" : "bottom"}
        sideOffset={isXpTheme ? 8 : 1}
        className="p-2 pt-4 w-auto min-w-4 h-40 flex flex-col items-center justify-center"
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
        <Button
          variant="ghost"
          size="icon"
          className="mt-2 h-6 w-6 text-md border-none focus-visible:ring-0"
          onClick={() => {
            launchApp("control-panels", {
              initialData: { defaultTab: "sound" },
            });
            setIsDropdownOpen(false);
          }}
        >
          <Gear className="h-4 w-4" weight="bold" />
        </Button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
