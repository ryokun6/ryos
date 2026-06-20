import { Button } from "@/components/ui/button";

export type StartupDiskPaneContentProps = {
  t: (key: string, opts?: Record<string, unknown>) => string;
  isAdmin: boolean;
  debugMode: boolean;
  handleShowBootScreen: () => void;
};

export function StartupDiskPaneContent({
  t,
  isAdmin,
  debugMode,
  handleShowBootScreen,
}: StartupDiskPaneContentProps) {
  return (
    <div className="control-panels-pref-form h-full overflow-y-auto">
      <div className="control-panels-pref-well space-y-3">
        <p className="text-[11px] text-neutral-600 font-geneva-12 leading-relaxed">
          {t("apps.control-panels.startupDiskDescription")}
        </p>
        {isAdmin && debugMode ? (
          <Button variant="retro" onClick={handleShowBootScreen} className="w-fit">
            {t("apps.control-panels.showBootScreen")}
          </Button>
        ) : (
          <p className="text-[11px] text-neutral-500 font-geneva-12 italic">
            {t("apps.control-panels.startupDiskNote")}
          </p>
        )}
      </div>
    </div>
  );
}
