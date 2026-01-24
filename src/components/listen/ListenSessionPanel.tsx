import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ListenSession } from "@/stores/useListenSessionStore";

interface ListenSessionPanelProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  session: ListenSession;
  isDj: boolean;
  onPassDj: (username: string) => void;
  onLeave: () => void;
  onSendReaction: (emoji: string) => void;
}

const REACTIONS = ["😄", "🔥", "👏", "❤️", "🎵"];

export function ListenSessionPanel({
  isOpen,
  onOpenChange,
  session,
  isDj,
  onPassDj,
  onLeave,
  onSendReaction,
}: ListenSessionPanelProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="bg-os-window-bg border-[length:var(--os-metrics-border-width)] border-os-window rounded-os shadow-os-window max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-normal text-[16px]">Listen Together</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="font-geneva-12 text-xs text-muted-foreground">
              Session ID: {session.id}
            </p>
            <div className="space-y-1">
              {session.users.map((user) => (
                <div
                  key={user.username}
                  className="flex items-center justify-between rounded border border-black/10 px-2 py-1"
                >
                  <span className="font-geneva-12 text-xs">
                    {session.djUsername === user.username ? "👑 " : "👤 "}
                    {user.username}
                  </span>
                  {isDj && user.username !== session.djUsername && (
                    <Button
                      variant="player"
                      onClick={() => onPassDj(user.username)}
                    >
                      Pass DJ
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="font-geneva-12 text-xs text-muted-foreground">Reactions</p>
            <div className="flex flex-wrap gap-1">
              {REACTIONS.map((emoji) => (
                <Button
                  key={emoji}
                  variant="player"
                  onClick={() => onSendReaction(emoji)}
                >
                  {emoji}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="retro" onClick={onLeave}>
              Leave Session
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
