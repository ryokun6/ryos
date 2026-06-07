import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useThemeStore } from "@/stores/useThemeStore";
import { useAppStore } from "@/stores/useAppStore";

/** Titlebar height per theme so auto-resize fits content + titlebar (matches WindowFrame / themes.css). */
export const TITLEBAR_HEIGHT_BY_THEME: Record<string, number> = {
  macosx: 24,
  system7: 24,
  xp: 30,
  win98: 22,
};

export interface EmulatorScreenSize {
  width: number;
  height: number;
}

export interface EmulatorPresetBase {
  screenSize: EmulatorScreenSize;
}

export interface UseEmulatorAppLogicOptions<TPreset extends EmulatorPresetBase> {
  instanceId?: string;
  defaultWindowSize: EmulatorScreenSize;
  helpAppId: string;
  helpItems: Parameters<typeof useTranslatedHelpItems>[1];
  selectedPreset: TPreset | null;
  setSelectedPreset: (preset: TPreset | null) => void;
  setIsEmulatorLoaded: (loaded: boolean) => void;
  /** Multiplier applied to content width/height when resizing (e.g. Infinite Mac screen scale). */
  contentScale?: number;
  onSelectPreset?: () => void;
  onBackToPresets?: () => void;
}

export function useEmulatorAppLogic<TPreset extends EmulatorPresetBase>({
  instanceId,
  defaultWindowSize,
  helpAppId,
  helpItems,
  selectedPreset,
  setSelectedPreset,
  setIsEmulatorLoaded,
  contentScale = 1,
  onSelectPreset,
  onBackToPresets,
}: UseEmulatorAppLogicOptions<TPreset>) {
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);

  const { t } = useTranslation();
  const { currentTheme, isWindowsTheme: isXpTheme } = useThemeFlags();
  const translatedHelpItems = useTranslatedHelpItems(helpAppId, helpItems);

  const resizeWindow = useCallback(
    (size: EmulatorScreenSize, scale: number = contentScale) => {
      if (!instanceId) return;
      const { instances, updateInstanceWindowState } = useAppStore.getState();
      const theme = useThemeStore.getState().current;
      const instance = instances[instanceId];
      if (instance) {
        const titlebarHeight = TITLEBAR_HEIGHT_BY_THEME[theme] ?? 24;
        updateInstanceWindowState(
          instanceId,
          instance.position ?? { x: 100, y: 100 },
          {
            width: Math.round(size.width * scale),
            height: Math.round(size.height * scale) + titlebarHeight,
          }
        );
      }
    },
    [instanceId, contentScale]
  );

  const handleSelectPreset = useCallback(
    (preset: TPreset) => {
      setSelectedPreset(preset);
      setIsEmulatorLoaded(false);
      onSelectPreset?.();
      resizeWindow(preset.screenSize);
    },
    [resizeWindow, setSelectedPreset, setIsEmulatorLoaded, onSelectPreset]
  );

  const handleBackToPresets = useCallback(() => {
    setSelectedPreset(null);
    setIsEmulatorLoaded(false);
    onBackToPresets?.();
    resizeWindow(defaultWindowSize);
  }, [
    resizeWindow,
    defaultWindowSize,
    setSelectedPreset,
    setIsEmulatorLoaded,
    onBackToPresets,
  ]);

  return {
    t,
    translatedHelpItems,
    currentTheme,
    isXpTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    selectedPreset,
    resizeWindow,
    handleSelectPreset,
    handleBackToPresets,
  };
}
