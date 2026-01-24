import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ListenSessionBadgeProps {
  userCount: number;
  isHost: boolean;
  isDj: boolean;
  onOpenPanel: () => void;
  onShare: () => void;
  onLeave: () => void;
  className?: string;
}

export function ListenSessionBadge({
  userCount,
  isHost,
  isDj,
  onOpenPanel,
  onShare,
  onLeave,
  className,
}: ListenSessionBadgeProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded border border-black/40 bg-white/80 px-2 py-1 shadow-sm",
        className
      )}
    >
      <Button variant="player" onClick={onOpenPanel}>
        🎧 {userCount} listening {isDj ? "• DJ" : ""}
      </Button>
      <Button variant="player" onClick={onShare}>
        Share
      </Button>
      <Button variant="player" onClick={onLeave}>
        {isHost ? "End" : "Leave"}
      </Button>
    </div>
  );
}
