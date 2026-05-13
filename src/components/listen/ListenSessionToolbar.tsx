import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useSound, Sounds } from "@/hooks/useSound";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import type { ListenSession } from "@/stores/useListenSessionStore";
import {
  connectionLabel,
  makeConnectionKey,
} from "@/lib/listenClientInstance";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Headphones,
  Export,
  Smiley,
  Fire,
  HandsClapping,
  Heart,
  MusicNote,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

// Reaction definitions with icons (! so color wins over parent font/foreground overrides)
const REACTIONS: { id: string; icon: Icon; color: string }[] = [
  { id: "smile", icon: Smiley, color: "!text-yellow-400" },
  { id: "fire", icon: Fire, color: "!text-orange-500" },
  { id: "clap", icon: HandsClapping, color: "!text-amber-400" },
  { id: "heart", icon: Heart, color: "!text-red-500" },
  { id: "music", icon: MusicNote, color: "!text-purple-400" },
];

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

interface ListenSessionToolbarProps {
  session: ListenSession;
  /** This tab is in the session but not the playback device */
  isRemoteOnly?: boolean;
  isHost: boolean;
  isDj: boolean;
  isAnonymous: boolean;
  listenerCount: number;
  currentUsername: string | null;
  currentClientInstanceId: string | null;
  onShare: () => void;
  onLeave: () => void;
  /** Host: set which device plays audio */
  onAssignPlaybackDevice: (username: string, clientInstanceId: string) => void;
  /** Non-host DJ: hand off playback to another member (legacy sync path) */
  onPassDj: (username: string, clientInstanceId: string) => void;
  onTransferHost: (username: string, clientInstanceId: string) => void;
  onSendReaction: (emoji: string) => void;
  onInteraction?: () => void;
  portalContainer?: HTMLElement | null;
  className?: string;
}

export function ListenSessionToolbar({
  session,
  isRemoteOnly = false,
  isHost,
  isDj,
  isAnonymous,
  listenerCount,
  currentUsername,
  currentClientInstanceId,
  onShare,
  onLeave,
  onAssignPlaybackDevice,
  onPassDj,
  onTransferHost,
  onSendReaction,
  onInteraction,
  portalContainer,
  className,
}: ListenSessionToolbarProps) {
  const { t } = useTranslation();
  const { isMacOSTheme: isMacTheme } = useThemeFlags();
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

  // Icon classes – ensure visible on both Mac (dark segment) and non‑Mac (dark glass)
  const iconClasses = isMacTheme
    ? "text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
    : "text-white/90";

  const svgSize = 14;

  const playbackValue = makeConnectionKey(
    session.djUsername,
    session.djClientInstanceId ??
      `legacy:${session.djUsername.toLowerCase()}`
  );

  const isSelfConnection = (u: (typeof session.users)[0]) =>
    u.username === currentUsername &&
    u.clientInstanceId === currentClientInstanceId;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Listen Session Status Island – count opens session menu (listeners, Pass DJ, Leave) */}
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
              className={cn(buttonClasses, "gap-1 px-2 w-auto")}
              title={t("apps.karaoke.liveListen.listening", { count: listenerCount })}
            >
              {isDj && (
                <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-white/20", iconClasses)}>
                  {t("apps.karaoke.liveListen.playbackBadge")}
                </span>
              )}
              {isRemoteOnly && !isDj && (
                <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-amber-500/35", iconClasses)}>
                  {t("apps.karaoke.liveListen.remoteBadge")}
                </span>
              )}
              <Headphones weight="fill" size={svgSize} className={iconClasses} />
              <span className={cn("text-sm tabular-nums", iconClasses)}>
                {listenerCount}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            container={portalContainer}
            side="bottom"
            align="center"
            sideOffset={8}
            className="px-0 w-56"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-2 py-1 text-xs text-muted-foreground">
              {t("apps.karaoke.liveListen.listening", { count: listenerCount })}
              {listenerCount - session.users.length > 0 &&
                ` (${t("apps.karaoke.liveListen.anonymous", { count: listenerCount - session.users.length })})`}
            </div>
            {session.users.length > 1 && (isHost || isDj) && (
              <>
                <div className="px-2 py-1 text-[11px] text-muted-foreground">
                  {isHost
                    ? t("apps.karaoke.liveListen.playbackOnDevice")
                    : t("apps.karaoke.liveListen.passPlayback")}
                </div>
                <DropdownMenuRadioGroup
                  value={playbackValue}
                  onValueChange={(key) => {
                    onInteraction?.();
                    if (key === playbackValue) return;
                    playClick();
                    const pipe = key.indexOf("|");
                    const uname = pipe === -1 ? key : key.slice(0, pipe);
                    const cid =
                      pipe === -1
                        ? `legacy:${uname.toLowerCase()}`
                        : key.slice(pipe + 1);
                    if (isHost) onAssignPlaybackDevice(uname, cid);
                    else onPassDj(uname, cid);
                  }}
                >
                  {session.users.map((user) => {
                    const cid =
                      user.clientInstanceId ??
                      `legacy:${user.username.toLowerCase()}`;
                    const key = makeConnectionKey(user.username, cid);
                    return (
                      <DropdownMenuRadioItem
                        key={key}
                        value={key}
                        className="text-md h-6 pr-3"
                      >
                        {connectionLabel(user.username, cid)}
                        {key === playbackValue
                          ? ` (${t("apps.karaoke.liveListen.playbackBadge")})`
                          : ""}
                      </DropdownMenuRadioItem>
                    );
                  })}
                </DropdownMenuRadioGroup>
              </>
            )}
            {isHost && session.users.length > 1 && (
              <>
                <DropdownMenuSeparator />
                <div className="px-2 py-1 text-[11px] text-muted-foreground">
                  {t("apps.karaoke.liveListen.makeHost")}
                </div>
                {session.users
                  .filter((u) => !isSelfConnection(u))
                  .map((user) => {
                    const cid =
                      user.clientInstanceId ??
                      `legacy:${user.username.toLowerCase()}`;
                    return (
                      <DropdownMenuItem
                        key={`host-${makeConnectionKey(user.username, cid)}`}
                        onClick={() => {
                          onInteraction?.();
                          playClick();
                          onTransferHost(user.username, cid);
                        }}
                        className="text-md h-6"
                      >
                        {connectionLabel(user.username, cid)}
                      </DropdownMenuItem>
                    );
                  })}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                onInteraction?.();
                playClick();
                onLeave();
              }}
              className="text-md h-6"
            >
              {isHost ? t("apps.karaoke.liveListen.endSession") : t("apps.karaoke.liveListen.leaveSession")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Reactions – separate button, only for logged-in users */}
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
                title={t("apps.karaoke.liveListen.sendReaction")}
              >
                <Smiley weight="fill" size={svgSize} className={iconClasses} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              container={portalContainer}
              side="bottom"
              align="center"
              sideOffset={8}
              className="px-1 py-1 flex gap-1 min-w-0 w-auto"
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
                  className={cn(
                    "w-8 h-8 flex items-center justify-center rounded hover:bg-accent transition-colors",
                    reaction.color
                  )}
                >
                  <reaction.icon
                    weight="fill"
                    size={18}
                    className={cn("shrink-0", reaction.color)}
                  />
                </button>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Share/Invite Island */}
      <div className={segmentClasses} style={aquaSegmentStyle}>
        {isMacTheme && <AquaShineOverlays />}
        <button
          type="button"
          onClick={handleClick(onShare)}
          className={buttonClasses}
          title={t("apps.karaoke.liveListen.inviteTitle")}
        >
          <Export weight="regular" size={svgSize} className={iconClasses} />
        </button>
      </div>

    </div>
  );
}
