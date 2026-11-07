import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import { AppMenuBarMenus } from "@/components/shared/menubar/AppMenuBarMenus";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { JOURNAL_FEATURES, JOURNAL_VIEWS } from "../types";
import type { JournalFeatureId, JournalView } from "../types";
import type { JournalLogic } from "../hooks/useJournalLogic";

export function JournalMenuBar({ l, onClose }: { l: JournalLogic; onClose: () => void }) {
  const { t } = l;
  const { isShareDialogOpen, setIsShareDialogOpen, isWindowsTheme, isMacOSTheme, appId, appName } =
    useAppMenuBarChrome("journal");

  return (
    <AppMenuBarShell
      isWindowsTheme={isWindowsTheme}
      isMacOSTheme={isMacOSTheme}
      appId={appId}
      appName={appName}
      isShareDialogOpen={isShareDialogOpen}
      setIsShareDialogOpen={setIsShareDialogOpen}
      helpItemLabel={t("apps.journal.menu.help")}
      aboutItemLabel={t("apps.journal.menu.about")}
      onShowHelp={() => l.setIsHelpDialogOpen(true)}
      onShowAbout={() => l.setIsAboutDialogOpen(true)}
    >
      <AppMenuBarMenus
        menus={[
          {
            label: t("common.menu.file"),
            items: [
              {
                type: "action",
                label: t("apps.journal.menu.reset"),
                onClick: () => l.api.resetDemo(),
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
                value: l.journal.view,
                onValueChange: (value) => l.api.setView(value as JournalView),
                options: JOURNAL_VIEWS.map((view) => ({
                  value: view,
                  label: t(`apps.journal.views.${view}`),
                })),
              },
              { type: "separator" },
              ...JOURNAL_FEATURES.map((feature) => ({
                type: "checkbox" as const,
                label: t(`apps.journal.features.${feature}`),
                checked: l.journal.toggles[feature],
                onChange: () => l.api.toggleFeature(feature as JournalFeatureId),
              })),
            ],
          },
        ]}
      />
    </AppMenuBarShell>
  );
}
