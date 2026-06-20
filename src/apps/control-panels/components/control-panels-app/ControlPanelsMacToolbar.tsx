import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { cn } from "@/lib/utils";
import { osToolbarSurfaceClassName } from "@/components/shared/osThemePrimitives";
import { appMetadata } from "../../index";
import {
  CONTROL_PANEL_PINNED_PANES,
  getControlPanelCategory,
  type ControlPanelPaneId,
} from "./controlPanelsCategories";

const SHOW_ALL_ICON = appMetadata.icon.replace(/^\/icons\//, "");

export type ControlPanelsMacToolbarProps = {
  t: (key: string) => string;
  showHome: boolean;
  onShowAll: () => void;
  onSelectPane: (paneId: ControlPanelPaneId) => void;
  activePane?: ControlPanelPaneId;
};

export function ControlPanelsMacToolbar({
  t,
  showHome,
  onShowAll,
  onSelectPane,
  activePane,
}: ControlPanelsMacToolbarProps) {
  return (
    <div
      className={cn(
        "control-panels-mac-toolbar flex items-stretch gap-2 px-2 py-0 shrink-0",
        osToolbarSurfaceClassName(
          { isMacOSTheme: true, isSystem7Theme: false, isWindowsTheme: false },
          { border: "bottom" }
        )
      )}
    >
      <div className="control-panels-mac-toolbar-pins flex items-stretch gap-0 min-w-0 flex-1">
        <button
          type="button"
          className={cn(
            "control-panels-toolbar-pin",
            showHome && "control-panels-toolbar-pin-active"
          )}
          onClick={onShowAll}
          aria-label={t("apps.control-panels.toolbar.showAll")}
          title={t("apps.control-panels.toolbar.showAll")}
        >
          <span className="control-panels-toolbar-pin-icon-shell">
            <ThemedIcon
              name={SHOW_ALL_ICON}
              alt=""
              className="control-panels-toolbar-pin-icon"
              draggable={false}
            />
          </span>
          <span className="control-panels-toolbar-pin-label">
            {t("apps.control-panels.toolbar.showAll")}
          </span>
        </button>

        <span className="control-panels-toolbar-divider" aria-hidden />

        {CONTROL_PANEL_PINNED_PANES.map((paneId) => {
          const category = getControlPanelCategory(paneId);
          if (!category) return null;
          const isActive = activePane === paneId;
          return (
            <button
              key={paneId}
              type="button"
              className={cn(
                "control-panels-toolbar-pin",
                isActive && "control-panels-toolbar-pin-active"
              )}
              onClick={() => onSelectPane(paneId)}
              aria-label={t(category.labelKey)}
              title={t(category.labelKey)}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="control-panels-toolbar-pin-icon-shell">
                <ThemedIcon
                  name={category.icon}
                  alt=""
                  className="control-panels-toolbar-pin-icon"
                  draggable={false}
                />
              </span>
              <span className="control-panels-toolbar-pin-label">
                {t(category.labelKey)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
