import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DisplayMode } from "@/utils/displayMode";
import { useDisplaySettingsStoreShallow } from "@/stores/useDisplaySettingsStore";
import { ControlPanelsPrefFormRow } from "./ControlPanelsPrefFormRow";

export type DisplaysPaneContentProps = {
  t: (key: string, opts?: Record<string, unknown>) => string;
  shaderEffectEnabled: boolean;
  setShaderEffectEnabled: (enabled: boolean) => void;
};

export function DisplaysPaneContent({
  t,
  shaderEffectEnabled,
  setShaderEffectEnabled,
}: DisplaysPaneContentProps) {
  const { displayMode, setDisplayMode } = useDisplaySettingsStoreShallow((s) => ({
    displayMode: s.displayMode,
    setDisplayMode: s.setDisplayMode,
  }));

  return (
    <div className="control-panels-pref-form space-y-0 h-full overflow-y-auto">
      <div className="control-panels-pref-form-section">
        <ControlPanelsPrefFormRow
          label={t("apps.control-panels.displayMode")}
          description={t("apps.control-panels.displayModeDescription")}
        >
          <Select
            value={displayMode}
            onValueChange={(value) => setDisplayMode(value as DisplayMode)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder={t("apps.control-panels.displayMode")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="color">{t("apps.control-panels.color")}</SelectItem>
              <SelectItem value="monotone">{t("apps.control-panels.mono")}</SelectItem>
              <SelectItem value="crt">{t("apps.control-panels.crt")}</SelectItem>
              <SelectItem value="sepia">{t("apps.control-panels.sepia")}</SelectItem>
              <SelectItem value="high-contrast">
                {t("apps.control-panels.highContrast")}
              </SelectItem>
              <SelectItem value="dream">{t("apps.control-panels.dream")}</SelectItem>
              <SelectItem value="invert">{t("apps.control-panels.invert")}</SelectItem>
            </SelectContent>
          </Select>
        </ControlPanelsPrefFormRow>

        <ControlPanelsPrefFormRow
          label={t("apps.control-panels.shaderEffect")}
          description={t("apps.control-panels.shaderEffectDescription")}
        >
          {/* Intentionally visible to all users on macOS — not gated under debug/admin. */}
          <Switch
            checked={shaderEffectEnabled}
            onCheckedChange={setShaderEffectEnabled}
            className="data-[state=checked]:bg-[#000000]"
          />
        </ControlPanelsPrefFormRow>
      </div>
    </div>
  );
}
