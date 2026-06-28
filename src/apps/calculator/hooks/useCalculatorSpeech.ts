import { useCallback, useReducer } from "react";
import { useTranslation } from "react-i18next";
import {
  formatDisplayForSpeech,
  formatKeyLabel,
  speakCalculatorText,
  stopCalculatorSpeech,
} from "../utils/calculatorSpeech";

export type CalculatorSpeechSettings = {
  speechEnabled: boolean;
  speakButtonPresses: boolean;
  speakResults: boolean;
};

export const DEFAULT_CALCULATOR_SPEECH: CalculatorSpeechSettings = {
  speechEnabled: true,
  speakButtonPresses: true,
  speakResults: true,
};

export function useCalculatorSpeech(initial: Partial<CalculatorSpeechSettings> = {}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;

  const [settings, setSettings] = useReducer(
    (state: CalculatorSpeechSettings, patch: Partial<CalculatorSpeechSettings>) => ({
      ...state,
      ...patch,
    }),
    { ...DEFAULT_CALCULATOR_SPEECH, ...initial }
  );

  const speakKey = useCallback(
    (label: string) => {
      if (!settings.speechEnabled || !settings.speakButtonPresses) return;
      speakCalculatorText(formatKeyLabel(label, t), { locale });
    },
    [settings.speechEnabled, settings.speakButtonPresses, locale, t]
  );

  const speakResult = useCallback(
    (display: string) => {
      if (!settings.speechEnabled || !settings.speakResults) return;
      speakCalculatorText(formatDisplayForSpeech(display, t), {
        locale,
        dedupeConsecutive: true,
      });
    },
    [settings.speechEnabled, settings.speakResults, locale, t]
  );

  return {
    ...settings,
    setSpeechEnabled: (speechEnabled: boolean) => {
      if (!speechEnabled) {
        stopCalculatorSpeech();
      }
      setSettings({ speechEnabled });
    },
    setSpeakButtonPresses: (speakButtonPresses: boolean) =>
      setSettings({ speakButtonPresses }),
    setSpeakResults: (speakResults: boolean) => setSettings({ speakResults }),
    speakKey,
    speakResult,
  };
}
