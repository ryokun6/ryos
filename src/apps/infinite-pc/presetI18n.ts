import type { TFunction } from "i18next";
import type { PcPreset } from "@/stores/useInfinitePcStore";

export function getPcPresetName(preset: PcPreset, t: TFunction): string {
  return t(`apps.pc.presets.${preset.id}.name`, { defaultValue: preset.name });
}

export function getPcPresetYear(preset: PcPreset, t: TFunction): string {
  return t(`apps.pc.presets.${preset.id}.year`, { defaultValue: preset.year });
}

export function getPcPresetDescription(preset: PcPreset, t: TFunction): string {
  return t(`apps.pc.presets.${preset.id}.description`, {
    defaultValue: preset.description,
  });
}
