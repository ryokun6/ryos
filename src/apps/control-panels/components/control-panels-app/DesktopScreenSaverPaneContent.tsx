import { useState } from "react";
import { WallpaperPicker } from "../WallpaperPicker";
import { ScreenSaverPicker } from "../ScreenSaverPicker";

export type DesktopScreenSaverPaneContentProps = {
  t: (key: string, opts?: Record<string, unknown>) => string;
};

type DesktopPaneTab = "desktop" | "screenSaver";

export function DesktopScreenSaverPaneContent({
  t,
}: DesktopScreenSaverPaneContentProps) {
  const [desktopTab, setDesktopTab] = useState<DesktopPaneTab>("desktop");

  return (
    <div className="control-panels-pref-form control-panels-pref-form-tabbed">
      <div className="control-panels-pref-tabbed">
        <div
          role="tablist"
          className="aqua-tab-bar control-panels-pref-tab-bar"
          aria-label={t("apps.control-panels.desktopAndScreenSaver")}
        >
          <button
            type="button"
            role="tab"
            className="aqua-tab"
            data-state={desktopTab === "desktop" ? "active" : "inactive"}
            aria-selected={desktopTab === "desktop"}
            onClick={() => setDesktopTab("desktop")}
          >
            {t("apps.control-panels.desktopTab")}
          </button>
          <button
            type="button"
            role="tab"
            className="aqua-tab"
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
