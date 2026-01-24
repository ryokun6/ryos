import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ListenSession } from "@/stores/useListenSessionStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { cn } from "@/lib/utils";

interface ListenSessionPanelProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  session: ListenSession;
  isDj: boolean;
  isAnonymous: boolean;
  listenerCount: number;
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
  isAnonymous,
  listenerCount,
  onPassDj,
  onLeave,
  onSendReaction,
}: ListenSessionPanelProps) {
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOsxTheme = currentTheme === "macosx";

  // Count anonymous listeners
  const anonymousCount = listenerCount - session.users.length;

  const dialogContent = (
    <div className={isXpTheme ? "p-2 px-4" : "p-3"}>
      <div className="space-y-3">
        {/* Listener count */}
        <p
          className={cn(
            "text-muted-foreground",
            isXpTheme
              ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[10px]"
              : "font-geneva-12 text-[10px]"
          )}
          style={{
            fontFamily: isXpTheme
              ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
              : undefined,
            fontSize: isXpTheme ? "10px" : undefined,
          }}
        >
          {listenerCount} listening{anonymousCount > 0 ? ` (${anonymousCount} anonymous)` : ""}
        </p>

        {/* Users list */}
        <div className="space-y-1">
          {session.users.map((user) => (
            <div
              key={user.username}
              className="flex items-center justify-between rounded border border-black/10 px-2 py-1"
            >
              <span
                className={cn(
                  isXpTheme
                    ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                    : "font-geneva-12 text-xs"
                )}
                style={{
                  fontFamily: isXpTheme
                    ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                    : undefined,
                  fontSize: isXpTheme ? "11px" : undefined,
                }}
              >
                {session.djUsername === user.username ? "👑 " : "👤 "}
                {user.username}
              </span>
              {isDj && user.username !== session.djUsername && (
                <Button
                  variant="retro"
                  onClick={() => onPassDj(user.username)}
                  className={cn(
                    "h-6 px-2 text-[10px]",
                    isXpTheme && "font-['Pixelated_MS_Sans_Serif',Arial]"
                  )}
                  style={{
                    fontFamily: isXpTheme
                      ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                      : undefined,
                  }}
                >
                  Pass DJ
                </Button>
              )}
            </div>
          ))}
        </div>

        {/* Reactions - hidden for anonymous users */}
        {!isAnonymous && (
          <div className="space-y-1">
            <p
              className={cn(
                "text-muted-foreground",
                isXpTheme
                  ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[10px]"
                  : "font-geneva-12 text-[10px]"
              )}
              style={{
                fontFamily: isXpTheme
                  ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                  : undefined,
                fontSize: isXpTheme ? "10px" : undefined,
              }}
            >
              Reactions
            </p>
            <div className="flex flex-wrap gap-1">
              {REACTIONS.map((emoji) => (
                <Button
                  key={emoji}
                  variant="retro"
                  onClick={() => onSendReaction(emoji)}
                  className="h-7 w-7 p-0 text-base"
                >
                  {emoji}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>

      <DialogFooter className="mt-3 flex justify-end">
        <Button
          variant="retro"
          onClick={onLeave}
          className={cn(
            "h-7",
            isXpTheme
              ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
              : "font-geneva-12 text-[12px]"
          )}
          style={{
            fontFamily: isXpTheme
              ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
              : undefined,
            fontSize: isXpTheme ? "11px" : undefined,
          }}
        >
          Leave Session
        </Button>
      </DialogFooter>
    </div>
  );

  if (isXpTheme) {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent
          className="p-0 overflow-hidden max-w-xs border-0"
          style={{ fontSize: "11px" }}
          onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
        >
          <div
            className="title-bar"
            style={currentTheme === "xp" ? { minHeight: "30px" } : undefined}
          >
            <div className="title-bar-text">Listen Together</div>
            <div className="title-bar-controls">
              <button aria-label="Close" data-action="close" onClick={() => onOpenChange(false)} />
            </div>
          </div>
          <div className="window-body">{dialogContent}</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-os-window-bg border-[length:var(--os-metrics-border-width)] border-os-window rounded-os shadow-os-window max-w-xs"
        onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
      >
        {isMacOsxTheme ? (
          <>
            <DialogHeader>Listen Together</DialogHeader>
            <DialogDescription className="sr-only">
              Manage your listen together session.
            </DialogDescription>
          </>
        ) : (
          <DialogHeader>
            <DialogTitle className="font-normal text-[13px]">
              Listen Together
            </DialogTitle>
            <DialogDescription className="sr-only">
              Manage your listen together session.
            </DialogDescription>
          </DialogHeader>
        )}
        {dialogContent}
      </DialogContent>
    </Dialog>
  );
}
