import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  AppMenuBarMenus,
  type MenuDescriptor,
} from "@/components/shared/menubar/AppMenuBarMenus";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { useTranslation } from "react-i18next";
import type { CalculatorMode } from "../hooks/useCalculatorLogic";

interface CalculatorMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  mode: CalculatorMode;
  onSetMode: (mode: CalculatorMode) => void;
  onClear: () => void;
  speechEnabled: boolean;
  onSpeechEnabledChange: (enabled: boolean) => void;
  speakButtonPresses: boolean;
  onSpeakButtonPressesChange: (enabled: boolean) => void;
  speakResults: boolean;
  onSpeakResultsChange: (enabled: boolean) => void;
}

export function CalculatorMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  mode,
  onSetMode,
  onClear,
  speechEnabled,
  onSpeechEnabledChange,
  speakButtonPresses,
  onSpeakButtonPressesChange,
  speakResults,
  onSpeakResultsChange,
}: CalculatorMenuBarProps) {
  const { t } = useTranslation();
  const {
    isShareDialogOpen,
    setIsShareDialogOpen,
    isWindowsTheme,
    isMacOSTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("calculator");

  const menus: MenuDescriptor[] = [
    {
      label: t("common.menu.file"),
      items: [
        {
          type: "action",
          label: t("apps.calculator.menu.clear"),
          onClick: onClear,
        },
        { type: "separator" },
        {
          type: "action",
          label: t("common.menu.close"),
          onClick: onClose,
          shortcutId: "close",
        },
      ],
    },
    {
      label: t("common.menu.view"),
      items: [
        {
          type: "radioGroup",
          value: mode,
          onValueChange: (value) => onSetMode(value as CalculatorMode),
          options: [
            {
              label: t("apps.calculator.menu.basic"),
              value: "basic",
            },
            {
              label: t("apps.calculator.menu.scientific"),
              value: "scientific",
            },
            {
              label: t("apps.calculator.menu.conversion"),
              value: "conversion",
            },
          ],
        },
      ],
    },
    {
      label: t("apps.calculator.menu.sound"),
      items: [
        {
          type: "checkbox",
          label: t("apps.calculator.menu.speechEnabled"),
          checked: speechEnabled,
          onChange: onSpeechEnabledChange,
        },
        { type: "separator" },
        {
          type: "checkbox",
          label: t("apps.calculator.menu.speakButtonPresses"),
          checked: speakButtonPresses,
          onChange: onSpeakButtonPressesChange,
          disabled: !speechEnabled,
        },
        {
          type: "checkbox",
          label: t("apps.calculator.menu.speakResults"),
          checked: speakResults,
          onChange: onSpeakResultsChange,
          disabled: !speechEnabled,
        },
      ],
    },
  ];

  return (
    <AppMenuBarShell
      isWindowsTheme={isWindowsTheme}
      isMacOSTheme={isMacOSTheme}
      appId={appId}
      appName={appName}
      isShareDialogOpen={isShareDialogOpen}
      setIsShareDialogOpen={setIsShareDialogOpen}
      helpItemLabel={t("apps.calculator.menu.help")}
      aboutItemLabel={t("apps.calculator.menu.about")}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
    >
      <AppMenuBarMenus menus={menus} />
    </AppMenuBarShell>
  );
}
