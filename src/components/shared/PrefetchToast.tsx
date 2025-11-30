/**
 * Toast component for showing prefetch progress
 */

import { BUILD_VERSION } from "@/config/buildVersion";

interface PrefetchToastProps {
  phase: string;
  completed: number;
  total: number;
  phaseCompleted?: number;
  phaseTotal?: number;
  percentage?: number;
}

interface PrefetchCompleteToastProps {
  version?: string;
  buildNumber?: string;
}

const phaseLabels: Record<string, string> = {
  icons: 'Updating icons',
  sounds: 'Updating sounds',
  scripts: 'Updating system files',
};

export function PrefetchToast({ 
  phase, 
  completed, 
  total,
  phaseCompleted = 0,
  phaseTotal = 0,
  percentage = 0,
}: PrefetchToastProps) {
  const label = phaseLabels[phase] || 'Updating assets';
  const displayPercentage = percentage || Math.round((completed / total) * 100);
  
  return (
    <div className="flex flex-col gap-1.5 w-full min-w-[200px]">
      <div className="flex justify-between items-center text-sm">
        <span>{label}...</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {displayPercentage}%
        </span>
      </div>
      <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary transition-all duration-200 ease-out rounded-full"
          style={{ width: `${displayPercentage}%` }}
        />
      </div>
      <div className="text-xs text-muted-foreground">
        {phaseTotal > 0 
          ? `${phaseCompleted}/${phaseTotal} files`
          : `${completed}/${total} total`
        }
      </div>
    </div>
  );
}

export function PrefetchCompleteToast({ version, buildNumber }: PrefetchCompleteToastProps) {
  const versionText = version || BUILD_VERSION;
  const buildText = buildNumber ? ` (build ${buildNumber})` : '';
  
  return (
    <div className="text-sm">
      Updated to version {versionText}{buildText}
    </div>
  );
}

