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
  hasUpdate?: boolean;
  onReload: () => void;
}

const phaseLabels: Record<string, string> = {
  icons: 'Caching icons',
  sounds: 'Caching sounds',
  scripts: 'Caching scripts',
};

export function PrefetchToast({ 
  phase, 
  completed, 
  total,
  phaseCompleted = 0,
  phaseTotal = 0,
  percentage = 0,
}: PrefetchToastProps) {
  const label = phaseLabels[phase] || 'Caching assets';
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

export function PrefetchCompleteToast({ hasUpdate, onReload }: PrefetchCompleteToastProps) {
  return (
    <div className="flex flex-col gap-2 w-full min-w-[200px]">
      <div className="text-sm">
        {hasUpdate 
          ? 'New version available!' 
          : 'Assets cached for offline use'
        }
      </div>
      <button
        onClick={onReload}
        className="w-full px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
      >
        {hasUpdate ? 'Reload to update' : 'Reload now'}
      </button>
    </div>
  );
}

