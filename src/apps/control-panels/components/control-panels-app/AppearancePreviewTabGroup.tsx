import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useControlPanelsTabClasses } from "./useControlPanelsTabClasses";

export type AppearancePreviewTabGroupProps = {
  t: (key: string, opts?: Record<string, unknown>) => string;
  /** Tab-panel content (the preview list). */
  children: ReactNode;
};

/**
 * Renders a faithful, non-interactive copy of the Control Panels preference
 * tab group (tab strip + content well) inside the Appearance theme preview.
 *
 * It reuses the exact same class hooks the real preference panes use
 * (`control-panels-pref-tab-bar` + `useControlPanelsTabClasses`, and a
 * `control-panels-pref-well`), so the preview tabs read identically to the
 * live settings tabs in every theme — centered Aqua tabs with a bordered well,
 * System 7 framed tabs, Windows XP/98 folder tabs, etc.
 */
export function AppearancePreviewTabGroup({
  t,
  children,
}: AppearancePreviewTabGroupProps) {
  const { barClassName, triggerClassName, triggerStyle } =
    useControlPanelsTabClasses();

  return (
    <div className="control-panels-theme-preview-tabbed">
      <div
        role="tablist"
        className={cn("control-panels-pref-tab-bar", barClassName)}
        aria-hidden="true"
      >
        <button
          type="button"
          role="tab"
          className={triggerClassName}
          style={triggerStyle}
          data-state="active"
          tabIndex={-1}
        >
          {t("apps.control-panels.themePreviewTabs.general")}
        </button>
        <button
          type="button"
          role="tab"
          className={triggerClassName}
          style={triggerStyle}
          data-state="inactive"
          tabIndex={-1}
        >
          {t("apps.control-panels.themePreviewTabs.sharing")}
        </button>
      </div>
      <div className="control-panels-pref-well control-panels-theme-preview-tab-well">
        {children}
      </div>
    </div>
  );
}
