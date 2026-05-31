import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SYNTH_PRESETS } from "@/hooks/useChatSynth";
import { VolumeMixer } from "../VolumeMixer";
import type { TabStyleConfig } from "@/utils/tabStyles";

export type SoundTabContentProps = {
  t: (key: string, opts?: Record<string, unknown>) => string;
  uiSoundsEnabled: boolean;
  handleUISoundsChange: (enabled: boolean) => void;
  speechEnabled: boolean;
  handleSpeechChange: (enabled: boolean) => void;
  terminalSoundsEnabled: boolean;
  setTerminalSoundsEnabled: (enabled: boolean) => void;
  synthPreset: string;
  handleSynthPresetChange: (preset: string) => void;
  tabStyles: TabStyleConfig;
  masterVolume: number;
  setMasterVolume: (volume: number) => void;
  setPrevMasterVolume: (volume: number) => void;
  handleMasterMuteToggle: () => void;
  uiVolume: number;
  setUiVolume: (volume: number) => void;
  setPrevUiVolume: (volume: number) => void;
  handleUiMuteToggle: () => void;
  speechVolume: number;
  setSpeechVolume: (volume: number) => void;
  setPrevSpeechVolume: (volume: number) => void;
  handleSpeechMuteToggle: () => void;
  chatSynthVolume: number;
  setChatSynthVolume: (volume: number) => void;
  setPrevChatSynthVolume: (volume: number) => void;
  handleChatSynthMuteToggle: () => void;
  ipodVolume: number;
  setIpodVolume: (volume: number) => void;
  setPrevIpodVolume: (volume: number) => void;
  handleIpodMuteToggle: () => void;
  isIOS: boolean;
};

export function SoundTabContent({
  t,
  uiSoundsEnabled,
  handleUISoundsChange,
  speechEnabled,
  handleSpeechChange,
  terminalSoundsEnabled,
  setTerminalSoundsEnabled,
  synthPreset,
  handleSynthPresetChange,
  tabStyles,
  masterVolume,
  setMasterVolume,
  setPrevMasterVolume,
  handleMasterMuteToggle,
  uiVolume,
  setUiVolume,
  setPrevUiVolume,
  handleUiMuteToggle,
  speechVolume,
  setSpeechVolume,
  setPrevSpeechVolume,
  handleSpeechMuteToggle,
  chatSynthVolume,
  setChatSynthVolume,
  setPrevChatSynthVolume,
  handleChatSynthMuteToggle,
  ipodVolume,
  setIpodVolume,
  setPrevIpodVolume,
  handleIpodMuteToggle,
  isIOS,
}: SoundTabContentProps) {
  return (
    <div className="space-y-4 h-full overflow-y-auto p-4 pt-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <Label>{t("apps.control-panels.uiSounds")}</Label>
          <Switch
            checked={uiSoundsEnabled}
            onCheckedChange={handleUISoundsChange}
            className="data-[state=checked]:bg-[#000000]"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <Label>{t("apps.control-panels.speech")}</Label>
          <Switch
            checked={speechEnabled}
            onCheckedChange={handleSpeechChange}
            className="data-[state=checked]:bg-[#000000]"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <Label>{t("apps.control-panels.terminalIeAmbientSynth")}</Label>
        </div>
        <Switch
          checked={terminalSoundsEnabled}
          onCheckedChange={setTerminalSoundsEnabled}
          className="data-[state=checked]:bg-[#000000]"
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <Label>{t("apps.control-panels.chatSynth")}</Label>
          <Select value={synthPreset} onValueChange={handleSynthPresetChange}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder={t("apps.control-panels.selectAPreset")} />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SYNTH_PRESETS).map(([key, preset]) => (
                <SelectItem key={key} value={key}>
                  {preset.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <hr className="my-3 border-t" style={tabStyles.separatorStyle} />

      <VolumeMixer
        masterVolume={masterVolume}
        setMasterVolume={setMasterVolume}
        setPrevMasterVolume={setPrevMasterVolume}
        handleMasterMuteToggle={handleMasterMuteToggle}
        uiVolume={uiVolume}
        setUiVolume={setUiVolume}
        setPrevUiVolume={setPrevUiVolume}
        handleUiMuteToggle={handleUiMuteToggle}
        speechVolume={speechVolume}
        setSpeechVolume={setSpeechVolume}
        setPrevSpeechVolume={setPrevSpeechVolume}
        handleSpeechMuteToggle={handleSpeechMuteToggle}
        chatSynthVolume={chatSynthVolume}
        setChatSynthVolume={setChatSynthVolume}
        setPrevChatSynthVolume={setPrevChatSynthVolume}
        handleChatSynthMuteToggle={handleChatSynthMuteToggle}
        ipodVolume={ipodVolume}
        setIpodVolume={setIpodVolume}
        setPrevIpodVolume={setPrevIpodVolume}
        handleIpodMuteToggle={handleIpodMuteToggle}
        isIOS={isIOS}
      />
    </div>
  );
}
