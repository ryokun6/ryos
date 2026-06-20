import type { RefObject } from "react";
import { Button } from "@/components/ui/button";

export type SharingPaneContentProps = {
  t: (key: string, opts?: Record<string, unknown>) => string;
  handleBackup: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleRestore: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleResetAll: () => void;
  setIsConfirmFormatOpen: (open: boolean) => void;
};

export function SharingPaneContent({
  t,
  handleBackup,
  fileInputRef,
  handleRestore,
  handleResetAll,
  setIsConfirmFormatOpen,
}: SharingPaneContentProps) {
  return (
    <div className="control-panels-pref-form space-y-0 h-full overflow-y-auto">
      <div className="control-panels-pref-form-section">
        <div className="flex gap-2">
          <Button variant="retro" onClick={handleBackup} className="flex-1">
            {t("apps.control-panels.backup")}
          </Button>
          <Button
            variant="retro"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1"
          >
            {t("apps.control-panels.restore")}
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleRestore}
            accept=".json,.gz"
            className="hidden"
          />
        </div>
        <p className="text-[11px] text-neutral-600 font-geneva-12">
          {t("apps.control-panels.backupRestoreDescription")}
        </p>
        <Button variant="retro" onClick={handleResetAll} className="w-full">
          {t("apps.control-panels.resetAllSettings")}
        </Button>
        <Button
          variant="retro"
          onClick={() => setIsConfirmFormatOpen(true)}
          className="w-full"
        >
          {t("apps.control-panels.formatFileSystem")}
        </Button>
      </div>
    </div>
  );
}
