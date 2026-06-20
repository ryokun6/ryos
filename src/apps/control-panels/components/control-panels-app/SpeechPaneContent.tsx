import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { ControlPanelsPrefFormRow } from "./ControlPanelsPrefFormRow";

export type SpeechPaneContentProps = {
  t: (key: string, opts?: Record<string, unknown>) => string;
  speechEnabled: boolean;
  handleSpeechChange: (enabled: boolean) => void;
  speechVolume: number;
  setSpeechVolume: (volume: number) => void;
  setPrevSpeechVolume: (volume: number) => void;
};

export function SpeechPaneContent({
  t,
  speechEnabled,
  handleSpeechChange,
  speechVolume,
  setSpeechVolume,
  setPrevSpeechVolume,
}: SpeechPaneContentProps) {
  return (
    <div className="control-panels-pref-form h-full overflow-y-auto">
      <div className="control-panels-pref-well space-y-4">
        <ControlPanelsPrefFormRow label={t("apps.control-panels.speech")}>
          <Switch
            checked={speechEnabled}
            onCheckedChange={handleSpeechChange}
            className="data-[state=checked]:bg-[#000000]"
          />
        </ControlPanelsPrefFormRow>

        {speechEnabled && (
          <div className="space-y-2 px-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-geneva-12">
                {t("apps.control-panels.speechVolume")}
              </span>
              <span className="text-[11px] text-neutral-600 font-geneva-12">
                {Math.round(speechVolume * 100)}%
              </span>
            </div>
            <Slider
              value={[speechVolume]}
              onValueChange={([value]) => {
                setSpeechVolume(value);
                if (value > 0) setPrevSpeechVolume(value);
              }}
              min={0}
              max={1}
              step={0.05}
              className="w-full"
            />
          </div>
        )}
      </div>
    </div>
  );
}
