import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useDisplaySettingsStoreShallow } from "@/stores/useDisplaySettingsStore";
import { ControlPanelsPrefFormRow } from "./ControlPanelsPrefFormRow";

export type EnergySaverPaneContentProps = {
  t: (key: string, opts?: Record<string, unknown>) => string;
};

export function EnergySaverPaneContent({ t }: EnergySaverPaneContentProps) {
  const {
    screenSaverEnabled,
    setScreenSaverEnabled,
    screenSaverIdleTime,
    setScreenSaverIdleTime,
  } = useDisplaySettingsStoreShallow((s) => ({
    screenSaverEnabled: s.screenSaverEnabled,
    setScreenSaverEnabled: s.setScreenSaverEnabled,
    screenSaverIdleTime: s.screenSaverIdleTime,
    setScreenSaverIdleTime: s.setScreenSaverIdleTime,
  }));

  return (
    <div className="control-panels-pref-form h-full overflow-y-auto">
      <div className="control-panels-pref-well space-y-4">
        <ControlPanelsPrefFormRow
          label={t("apps.control-panels.screenSaver")}
          description={t("apps.control-panels.screenSaverDescription")}
        >
          <Switch
            checked={screenSaverEnabled}
            onCheckedChange={setScreenSaverEnabled}
            className="data-[state=checked]:bg-[#000000]"
          />
        </ControlPanelsPrefFormRow>

        {screenSaverEnabled && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">
                {t("apps.control-panels.startAfter")}
              </Label>
              <span className="text-[11px] text-neutral-600 font-geneva-12">
                {screenSaverIdleTime}{" "}
                {screenSaverIdleTime === 1
                  ? t("apps.control-panels.minute")
                  : t("apps.control-panels.minutes")}
              </span>
            </div>
            <Slider
              value={[screenSaverIdleTime]}
              onValueChange={([value]) => setScreenSaverIdleTime(value)}
              min={1}
              max={30}
              step={1}
              className="w-full"
            />
          </div>
        )}
      </div>
    </div>
  );
}
