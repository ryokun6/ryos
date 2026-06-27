import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import { AppMenuBarMenus } from "@/components/shared/menubar/AppMenuBarMenus";
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
}

export function CalculatorMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  mode,
  onSetMode,
  onClear,
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

  return (
    <AppMenuBarShell
      isWindowsTheme={isWindowsTheme}
      isMacOSTheme={isMacOSTheme}
      appId={appId}
      appName={appName}
      isShareDialogOpen={isShareDialogOpen}
      setIsShareDialogOpen={setIsShareDialogOpen}
      helpItemLabel={t("apps.calculator.menu.help", "Calculator Help")}
      aboutItemLabel={t("apps.calculator.menu.about", "About Calculator")}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
    >
      <AppMenuBarMenus
        menus={[
          {
            label: t("common.menu.file"),
            items: [
              {
                type: "action",
                label: t("apps.calculator.menu.clear", "Clear"),
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
                    label: t("apps.calculator.menu.basic", "Basic"),
                    value: "basic",
                  },
                  {
                    label: t("apps.calculator.menu.scientific", "Scientific"),
                    value: "scientific",
                  },
                  {
                    label: t("apps.calculator.menu.conversion", "Conversion"),
                    value: "conversion",
                  },
                ],
              },
            ],
          },
        ]}
      />
    </AppMenuBarShell>
  );
}
