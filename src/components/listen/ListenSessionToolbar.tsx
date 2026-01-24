import { cn } from "@/lib/utils";
import { useSound, Sounds } from "@/hooks/useSound";
import { useThemeStore } from "@/stores/useThemeStore";
import type { ListenSession } from "@/stores/useListenSessionStore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Headphones,
  ShareNetwork,
  SignOut,
  Smiley,
  Users,
  Crown,
  User,
  Fire,
  HandsClapping,
  Heart,
  MusicNote,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

// Aqua-style shine overlays for macOS X theme (dark glass style)
function AquaShineOverlays() {
  return (
    <div
      className="pointer-events-none absolute left-1/2 -translate-x-1/2"
      style={{
        top: "2px",
        height: "35%",
        width: "calc(100% - 24px)",
        borderRadius: "100px",
        background:
          "linear-gradient(rgba(255,255,255,0.06), rgba(255,255,255,0.01))",
        filter: "blur(0.5px)",
        zIndex: 2,
      }}
    />
  );
}

// Reaction definitions with icons
const REACTIONS: { id: string; icon: Icon; color: string }[] = [
  { id: "smile", icon: Smiley, color: "text-yellow-400" },
  { id: "fire", icon: Fire, color: "text-orange-500" },
  { id: "clap", icon: HandsClapping, color: "text-amber-400" },
  { id: "heart", icon: Heart, color: "text-red-500" },
  { id: "music", icon: MusicNote, color: "text-purple-400" },
];

interface ListenSessionToolbarProps {
  session: ListenSession;
  isDj: boolean;
  isAnonymous: boolean;
  listenerCount: number;
  onShare: () => void;
  onLeave: () => void;
  onOpenPanel: () => void;
  onPassDj: (username: string) => void;
  onSendReaction: (emoji: string) => void;
  onInteraction?: () => void;
  portalContainer?: HTMLElement | null;
  className?: string;
}

export function ListenSessionToolbar({
  session,
  isDj,
  isAnonymous,
  listenerCount,
  onShare,
  onLeave,
  onOpenPanel,
  onPassDj,
  onSendReaction,
  onInteraction,
  portalContainer,
  className,
}: ListenSessionToolbarProps) {
  const currentTheme = useThemeStore((s) => s.current);
  const isMacTheme = currentTheme === "macosx";
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);

  const handleClick =
    (handler: () => void) => (e: React.MouseEvent) => {
      e.stopPropagation();
      playClick();
      onInteraction?.();
      handler();
    };

  // Common styles for each island segment (matching FullscreenPlayerControls)
  const segmentClasses = isMacTheme
    ? "relative overflow-hidden rounded-full shadow-lg flex items-center gap-1 px-1 py-1"
    : "border border-white/10 backdrop-blur-sm rounded-full shadow-lg flex items-center gap-1 px-1 py-1 bg-neutral-800/60";

  // Aqua segment inline styles
  const aquaSegmentStyle: React.CSSProperties = isMacTheme
    ? {
        background:
          "linear-gradient(to bottom, rgba(60, 60, 60, 0.6), rgba(30, 30, 30, 0.5))",
        boxShadow:
          "0 2px 4px rgba(0, 0, 0, 0.2), inset 0 0 0 0.5px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
      }
    : {};

  // Button classes
  const buttonClasses = isMacTheme
    ? "w-8 h-8 flex items-center justify-center rounded-full transition-colors focus:outline-none relative z-10"
    : "w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors focus:outline-none";

  // Icon classes
  const iconClasses = isMacTheme
    ? "text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
    : "";

  const svgSize = 14;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Listen Session Status Island */}
      <div className={segmentClasses} style={aquaSegmentStyle}>
        {isMacTheme && <AquaShineOverlays />}

        {/* Listener count - opens panel */}
        <button
          type="button"
          onClick={handleClick(onOpenPanel)}
          className={cn(buttonClasses, "gap-1 px-2 w-auto")}
          title={`${listenerCount} listening`}
        >
          <Headphones weight="fill" size={svgSize} className={iconClasses} />
          <span className={cn("text-sm tabular-nums", iconClasses)}>
            {listenerCount}
          </span>
          {isDj && (
            <Crown weight="fill" size={12} className={cn("ml-0.5", iconClasses)} />
          )}
        </button>

        {/* Users dropdown for DJ pass */}
        {isDj && session.users.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onInteraction?.();
                }}
                className={buttonClasses}
                title="Pass DJ"
              >
                <Users weight="fill" size={svgSize} className={iconClasses} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              container={portalContainer}
              side="top"
              align="center"
              sideOffset={8}
              className="px-0 min-w-[140px]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-2 py-1 text-xs text-muted-foreground">
                Pass DJ to...
              </div>
              <DropdownMenuSeparator />
              {session.users
                .filter((u) => u.username !== session.djUsername)
                .map((user) => (
                  <DropdownMenuItem
                    key={user.username}
                    onClick={() => {
                      onInteraction?.();
                      playClick();
                      onPassDj(user.username);
                    }}
                    className="text-sm flex items-center gap-1.5"
                  >
                    <User weight="fill" size={14} className="text-muted-foreground" />
                    {user.username}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Share/Invite */}
        <button
          type="button"
          onClick={handleClick(onShare)}
          className={buttonClasses}
          title="Invite"
        >
          <ShareNetwork weight="fill" size={svgSize} className={iconClasses} />
        </button>
      </div>

      {/* Reactions Island - only for logged-in users */}
      {!isAnonymous && (
        <div className={segmentClasses} style={aquaSegmentStyle}>
          {isMacTheme && <AquaShineOverlays />}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onInteraction?.();
                }}
                className={buttonClasses}
                title="Send Reaction"
              >
                <Smiley weight="fill" size={svgSize} className={iconClasses} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              container={portalContainer}
              side="top"
              align="center"
              sideOffset={8}
              className="px-1 py-1 flex gap-1 min-w-0"
              onClick={(e) => e.stopPropagation()}
            >
              {REACTIONS.map((reaction) => (
                <button
                  key={reaction.id}
                  type="button"
                  onClick={() => {
                    playClick();
                    onSendReaction(reaction.id);
                    onInteraction?.();
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded hover:bg-accent transition-colors"
                >
                  <reaction.icon weight="fill" size={18} className={reaction.color} />
                </button>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Leave Session Island */}
      <div className={segmentClasses} style={aquaSegmentStyle}>
        {isMacTheme && <AquaShineOverlays />}
        <button
          type="button"
          onClick={handleClick(onLeave)}
          className={buttonClasses}
          title={session.hostUsername === session.djUsername ? "End Session" : "Leave Session"}
        >
          <SignOut weight="fill" size={svgSize} className={cn(iconClasses, "text-red-400")} />
        </button>
      </div>
    </div>
  );
}
