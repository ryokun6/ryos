/**
 * Toast component for showing prefetch progress
 */

import { useTranslation } from "react-i18next";

interface PrefetchToastProps {
  phase: string;
  completed: number;
  total: number;
  phaseCompleted?: number;
  phaseTotal?: number;
  percentage?: number;
}

interface PrefetchCompleteToastProps {
  version: string;
  buildNumber: string;
}

export function PrefetchToast({ 
  phase, 
  completed, 
  total,
  phaseCompleted = 0,
  phaseTotal = 0,
  percentage = 0,
}: PrefetchToastProps) {
  const { t } = useTranslation();
  
  const phaseLabels: Record<string, string> = {
    icons: t("common.toast.updatingIcons"),
    sounds: t("common.toast.updatingSounds"),
    scripts: t("common.toast.updatingSystemFiles"),
  };
  
  const label = phaseLabels[phase] || t("common.toast.updatingAssets");
  const displayPercentage = percentage || Math.round((completed / total) * 100);
  
  const fileCount = phaseTotal > 0 
    ? `${phaseCompleted}/${phaseTotal} ${t("common.toast.files")}`
    : `${completed}/${total} ${t("common.toast.total")}`;
  
  return (
    <div className="flex flex-col gap-1.5 w-full min-w-[200px]">
      <div className="text-sm">
        {label}...
      </div>
      <div className="text-xs text-muted-foreground">
        <span className="tabular-nums">{displayPercentage}%</span>
        {' · '}
        {fileCount}
      </div>
    </div>
  );
}

export function PrefetchCompleteToast({ version, buildNumber }: PrefetchCompleteToastProps) {
  const { t } = useTranslation();
  
  return (
    <div className="text-sm">
      {t("common.toast.updateReady", { version, buildNumber })}
    </div>
  );
}

