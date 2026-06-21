import { useState } from "react";
import { cn } from "@/lib/utils";
import { WallpaperPicker } from "../WallpaperPicker";
import { ScreenSaverPicker } from "../ScreenSaverPicker";
import { useControlPanelsTabClasses } from "./useControlPanelsTabClasses";

export type DesktopScreenSaverPaneContentProps = {
  t: (key: string, opts?: Record<string, unknown>) => string;
};

type DesktopPaneTab = "desktop" | "screenSaver";

export function DesktopScreenSaverPaneContent({
  t,
}: DesktopScreenSaverPaneContentProps) {
  const [desktopTab, setDesktopTab] = useState<DesktopPaneTab>("desktop");
  const { barClassName, triggerClassName, triggerStyle } =
    useControlPanelsTabClasses();

  return (
    <div className="control-panels-pref-form control-panels-pref-form-tabbed">
      <div className="control-panels-pref-tabbed">
        <div
          role="tablist"
          className={cn("control-panels-pref-tab-bar", barClassName)}
          aria-label={t("apps.control-panels.desktopAndScreenSaver")}
        >
          <button
            type="button"
            role="tab"
            className={triggerClassName}
            style={triggerStyle}
            data-state={desktopTab === "desktop" ? "active" : "inactive"}
            aria-selected={desktopTab === "desktop"}
            onClick={() => setDesktopTab("desktop")}
          >
            {t("apps.control-panels.desktopTab")}
          </button>
          <button
            type="button"
            role="tab"
            className={triggerClassName}
            style={triggerStyle}
            data-state={desktopTab === "screenSaver" ? "active" : "inactive"}
            aria-selected={desktopTab === "screenSaver"}
            onClick={() => setDesktopTab("screenSaver")}
          >
            {t("apps.control-panels.screenSaverTab")}
          </button>
        </div>
        <div className="control-panels-pref-well">
          <div
            role="tabpanel"
            className="control-panels-pref-tab-panel"
            hidden={desktopTab !== "desktop"}
            aria-hidden={desktopTab !== "desktop"}
          >
            <WallpaperPicker />
          </div>
          <div
            role="tabpanel"
            className="control-panels-pref-tab-panel"
            hidden={desktopTab !== "screenSaver"}
            aria-hidden={desktopTab !== "screenSaver"}
          >
            <ScreenSaverPicker />
          </div>
        </div>
      </div>
    </div>
  );
}
