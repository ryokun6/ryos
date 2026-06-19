import { cn } from "@/lib/utils";
import type { AdminImportStatus } from "./adminImportStatus";

export interface AdminImportStatusBarProps {
  shouldShowImportStatus: boolean;
  isMacOSTheme: boolean;
  importProgressPercent: number;
  importStatusText: string;
  importStatus: AdminImportStatus;
}

export function AdminImportStatusBar({
  shouldShowImportStatus,
  isMacOSTheme,
  importProgressPercent,
  importStatusText,
  importStatus,
}: AdminImportStatusBarProps) {
  if (!shouldShowImportStatus) return null;
  return (
    <div className="px-2 py-1.5 border-b border-black/10">
      <div className="space-y-1">
        {isMacOSTheme ? (
          <div className="aqua-progress w-full h-[14px]">
            <div
              className={cn(
                "aqua-progress-fill transition-all duration-300 ease-out",
                importStatus.phase === "failed" && "opacity-60",
              )}
              style={{ width: `${importProgressPercent}%` }}
            />
          </div>
        ) : (
          <div className="w-full h-3 bg-neutral-200 rounded-sm overflow-hidden border border-neutral-300">
            <div
              className={cn(
                "h-full bg-neutral-600 transition-all duration-300 ease-out",
                importStatus.phase === "failed" && "bg-red-500",
                importStatus.phase === "completed" && "bg-green-600",
              )}
              style={{ width: `${importProgressPercent}%` }}
            />
          </div>
        )}
        <p
          className={cn(
            "text-[11px] font-geneva-12",
            importStatus.phase === "failed"
              ? "text-red-600"
              : "text-neutral-600",
          )}
        >
          {importStatusText}
          {importProgressPercent > 0 &&
            importProgressPercent < 100 &&
            ` (${importProgressPercent}%)`}
        </p>
      </div>
    </div>
  );
}
