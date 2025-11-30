/**
 * Toast component for showing prefetch progress
 */

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
  
  const fileCount = phaseTotal > 0 
    ? `${phaseCompleted}/${phaseTotal} files`
    : `${completed}/${total} total`;
  
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
  return (
    <div className="text-sm">
      Updated to version {version} ({buildNumber})
    </div>
  );
}

