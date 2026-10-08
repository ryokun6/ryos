import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import { AppMenuBarMenus } from "@/components/shared/menubar/AppMenuBarMenus";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { requestCloudSyncDomainCheck } from "@/utils/cloudSyncEvents";
import { useFitnessStore } from "@/stores/useFitnessStore";
import type { FitnessLogic } from "../hooks/useFitnessLogic";
import type { FitnessView, UnitSystem } from "../types";
import { SCHEDULE_TEMPLATE_IDS } from "../utils/schedule";
import { FITNESS_VIEWS } from "../types";

export function FitnessMenuBar({ l, onClose }: { l: FitnessLogic; onClose: () => void }) {
  const { t } = l;
  const { isShareDialogOpen, setIsShareDialogOpen, isWindowsTheme, isMacOSTheme, appId, appName } =
    useAppMenuBarChrome("fitness");

  return (
    <AppMenuBarShell
      isWindowsTheme={isWindowsTheme}
      isMacOSTheme={isMacOSTheme}
      appId={appId}
      appName={appName}
      isShareDialogOpen={isShareDialogOpen}
      setIsShareDialogOpen={setIsShareDialogOpen}
      helpItemLabel={t("apps.fitness.menu.help")}
      aboutItemLabel={t("apps.fitness.menu.about")}
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
                label: t("apps.fitness.menu.logWorkout"),
                onClick: () => {
                  l.setWorkoutDate(l.todayKey);
                  l.setView("workouts");
                },
              },
              {
                type: "action",
                label: t("apps.fitness.menu.logFood"),
                onClick: () => {
                  l.setFoodDate(l.todayKey);
                  l.setView("food");
                },
              },
              {
                type: "action",
                label: t("apps.fitness.menu.logStats"),
                onClick: () => l.setView("body"),
              },
              { type: "separator" },
              {
                type: "action",
                label: t("apps.fitness.menu.sync"),
                onClick: () => requestCloudSyncDomainCheck("fitness"),
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
                value: l.view,
                onValueChange: (value) => l.setView(value as FitnessView),
                options: FITNESS_VIEWS.map((view) => ({
                  value: view,
                  label: t(`apps.fitness.views.${view}`),
                })),
              },
              { type: "separator" },
              {
                type: "submenu",
                label: t("apps.fitness.menu.units"),
                items: [
                  {
                    type: "radioGroup",
                    value: l.units,
                    onValueChange: (value) => l.setUnits(value as UnitSystem),
                    options: [
                      { value: "metric", label: t("apps.fitness.units.metric") },
                      { value: "imperial", label: t("apps.fitness.units.imperial") },
                    ],
                  },
                ],
              },
            ],
          },
          {
            label: t("apps.fitness.menu.plan"),
            items: [
              {
                type: "submenu",
                label: t("apps.fitness.schedule.applyTemplate"),
                items: SCHEDULE_TEMPLATE_IDS.map((id) => ({
                  type: "action" as const,
                  label: t(`apps.fitness.templates.${id}`),
                  onClick: () => useFitnessStore.getState().applyScheduleTemplate(id),
                })),
              },
              { type: "separator" },
              {
                type: "action",
                label: t("apps.fitness.menu.goals"),
                onClick: () => l.setView("body"),
              },
            ],
          },
        ]}
      />
    </AppMenuBarShell>
  );
}
