import { useState } from "react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SYNTH_PRESETS } from "@/hooks/chatSynthPresets";
import { VolumeMixer } from "../VolumeMixer";
import { ControlPanelsPrefFormRow } from "./ControlPanelsPrefFormRow";
import type { SoundTabContentProps } from "./SoundTabContent";
import { useControlPanelsTabClasses } from "./useControlPanelsTabClasses";

export type SoundPaneContentProps = Omit<
  SoundTabContentProps,
  "tabStyles" | "prefPaneLayout"
>;

type SoundPaneTab = "effects" | "output";

export function SoundPaneContent({
  t,
  uiSoundsEnabled,
  handleUISoundsChange,
  speechEnabled,
  handleSpeechChange,
  terminalSoundsEnabled,
  setTerminalSoundsEnabled,
  synthPreset,
  handleSynthPresetChange,
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
}: SoundPaneContentProps) {
  const [soundTab, setSoundTab] = useState<SoundPaneTab>("effects");
  const { barClassName, triggerClassName, triggerStyle } =
    useControlPanelsTabClasses();

  return (
    <div className="control-panels-pref-form control-panels-pref-form-tabbed">
      <div className="control-panels-pref-tabbed">
        <div
          role="tablist"
          className={cn("control-panels-pref-tab-bar", barClassName)}
          aria-label={t("apps.control-panels.sound")}
        >
          <button
            type="button"
            role="tab"
            className={triggerClassName}
            style={triggerStyle}
            data-state={soundTab === "effects" ? "active" : "inactive"}
            aria-selected={soundTab === "effects"}
            onClick={() => setSoundTab("effects")}
          >
            {t("apps.control-panels.soundTabs.effects")}
          </button>
          <button
            type="button"
            role="tab"
            className={triggerClassName}
            style={triggerStyle}
            data-state={soundTab === "output" ? "active" : "inactive"}
            aria-selected={soundTab === "output"}
            onClick={() => setSoundTab("output")}
          >
            {t("apps.control-panels.soundTabs.output")}
          </button>
        </div>
        <div className="control-panels-pref-well">
          <div
            role="tabpanel"
            className="control-panels-pref-tab-panel"
            hidden={soundTab !== "effects"}
            aria-hidden={soundTab !== "effects"}
          >
            <div className="control-panels-pref-form-section">
              <ControlPanelsPrefFormRow
                label={t("apps.control-panels.uiSounds")}
                description={t("apps.control-panels.uiSoundsDescription")}
              >
                <Switch
                  checked={uiSoundsEnabled}
                  onCheckedChange={handleUISoundsChange}
                  className="data-[state=checked]:bg-[#000000]"
                />
              </ControlPanelsPrefFormRow>

              <ControlPanelsPrefFormRow
                label={t("apps.control-panels.speech")}
                description={t("apps.control-panels.speechDescription")}
              >
                <Switch
                  checked={speechEnabled}
                  onCheckedChange={handleSpeechChange}
                  className="data-[state=checked]:bg-[#000000]"
                />
              </ControlPanelsPrefFormRow>

              <ControlPanelsPrefFormRow
                label={t("apps.control-panels.terminalIeAmbientSynth")}
                description={t("apps.control-panels.terminalIeAmbientSynthDescription")}
              >
                <Switch
                  checked={terminalSoundsEnabled}
                  onCheckedChange={setTerminalSoundsEnabled}
                  className="data-[state=checked]:bg-[#000000]"
                />
              </ControlPanelsPrefFormRow>

              <ControlPanelsPrefFormRow
                label={t("apps.control-panels.chatSynth")}
                description={t("apps.control-panels.chatSynthDescription")}
              >
                <Select value={synthPreset} onValueChange={handleSynthPresetChange}>
                  <SelectTrigger className="w-[140px]">
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
              </ControlPanelsPrefFormRow>
            </div>
          </div>
          <div
            role="tabpanel"
            className="control-panels-pref-tab-panel"
            hidden={soundTab !== "output"}
            aria-hidden={soundTab !== "output"}
          >
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
        </div>
      </div>
    </div>
  );
}
