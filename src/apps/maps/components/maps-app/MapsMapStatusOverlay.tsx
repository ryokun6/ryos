import { cn } from "@/lib/utils";

export interface MapsMapStatusOverlayProps {
  isDarkMode: boolean;
  title: string;
  message: string;
  showTokenHint: boolean;
  tokenHint: string;
}

export function MapsMapStatusOverlay({
  isDarkMode,
  title,
  message,
  showTokenHint,
  tokenHint,
}: MapsMapStatusOverlayProps) {
  return (
    <div
      className={cn(
        "absolute inset-0 z-[5] flex items-center justify-center px-6 text-center",
        "bg-os-window-bg/90 backdrop-blur-sm",
        "font-os-ui text-[12px]",
        isDarkMode ? "text-white/70" : "text-black/70"
      )}
    >
      <div className="max-w-[360px] space-y-2">
        <div
          className={cn(
            "text-[14px] font-semibold",
            isDarkMode ? "text-white" : "text-black"
          )}
        >
          {title}
        </div>
        <div>{message}</div>
        {showTokenHint && (
          <div
            className={cn(
              "text-[11px]",
              isDarkMode ? "text-white/60" : "text-black/60"
            )}
          >
            {tokenHint}
          </div>
        )}
      </div>
    </div>
  );
}
