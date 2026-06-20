import { Button } from "@/components/ui/button";
import { VersionDisplay } from "./VersionDisplay";

export type SoftwareUpdatePaneContentProps = {
  t: (key: string, opts?: Record<string, unknown>) => string;
  handleCheckForUpdates: () => void;
};

export function SoftwareUpdatePaneContent({
  t,
  handleCheckForUpdates,
}: SoftwareUpdatePaneContentProps) {
  return (
    <div className="control-panels-pref-form space-y-0 h-full overflow-y-auto">
      <div className="control-panels-pref-form-section">
        <Button variant="retro" onClick={handleCheckForUpdates} className="w-full">
          {t("apps.control-panels.checkForUpdates")}
        </Button>
        <VersionDisplay />
      </div>
    </div>
  );
}
