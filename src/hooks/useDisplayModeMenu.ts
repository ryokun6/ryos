import { useCallback, useMemo } from "react";
import type { TFunction } from "i18next";
import { DisplayMode } from "@/types/lyrics";

export interface DisplayModeOption {
  value: DisplayMode;
  label: string;
}

export function useDisplayModeOptions(
  t: TFunction,
  options?: { hideVideoOption?: boolean }
): DisplayModeOption[] {
  const hideVideoOption = options?.hideVideoOption ?? false;
  return useMemo(() => {
    const allOptions: DisplayModeOption[] = [
      { value: DisplayMode.Video, label: t("apps.ipod.menu.displayVideo") },
      { value: DisplayMode.Mesh, label: t("apps.ipod.menu.displayGradient") },
      { value: DisplayMode.Water, label: t("apps.ipod.menu.displayWater") },
      { value: DisplayMode.Shader, label: t("apps.ipod.menu.displayShader") },
      {
        value: DisplayMode.Landscapes,
        label: t("apps.ipod.menu.displayLandscapes"),
      },
      { value: DisplayMode.Cover, label: t("apps.ipod.menu.displayCover") },
    ];

    return hideVideoOption
      ? allOptions.filter((option) => option.value !== DisplayMode.Video)
      : allOptions;
  }, [hideVideoOption, t]);
}

export function useDisplayModeSelect(params: {
  t: TFunction;
  setDisplayMode: (mode: DisplayMode) => void;
  showStatus: (message: string) => void;
  coerceVideoToCover?: boolean;
}): (value: DisplayMode) => void {
  const { t, setDisplayMode, showStatus, coerceVideoToCover } = params;
  return useCallback(
    (value: DisplayMode) => {
      const nextMode =
        coerceVideoToCover && value === DisplayMode.Video
          ? DisplayMode.Cover
          : value;
      setDisplayMode(nextMode);
      const labels: Record<DisplayMode, string> = {
        [DisplayMode.Video]: t("apps.ipod.menu.displayVideo"),
        [DisplayMode.Cover]: t("apps.ipod.menu.displayCover"),
        [DisplayMode.Landscapes]: t("apps.ipod.menu.displayLandscapes"),
        [DisplayMode.Shader]: t("apps.ipod.menu.displayShader"),
        [DisplayMode.Mesh]: t("apps.ipod.menu.displayGradient"),
        [DisplayMode.Water]: t("apps.ipod.menu.displayWater"),
      };
      const label = labels[nextMode] ?? nextMode;
      showStatus(`${t("apps.ipod.menu.display", "Display")}: ${label}`);
    },
    [coerceVideoToCover, setDisplayMode, showStatus, t]
  );
}
