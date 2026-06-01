import type { CSSProperties, MouseEvent, ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useSound, Sounds } from "@/hooks/useSound";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import type { ListenSession } from "@/stores/useListenSessionStore";
import {
  connectionLabel,
  makeConnectionKey,
} from "@/lib/listenClientInstance";
import { REACTION_MAP } from "@/components/listen/reactionFloaterConstants";
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
  Smiley,
} from "@phosphor-icons/react";

const REACTIONS = Object.entries(REACTION_MAP).map(([id, reaction]) => ({
  id,
  ...reaction,
}));

interface KaraokeFullscreenRoomControlsProps {
  session: ListenSession | null;
  isRemoteOnly: boolean;
  isHost: boolean;
  isDj: boolean;
  isAnonymous: boolean;
  listenerCount: number;
  currentUsername: string | null;
  currentClientInstanceId: string | null;
  onJoinRoom: () => void;
  onLeave: () => void;
  onAssignPlaybackDevice: (username: string, clientInstanceId: string) => void;
  onPassDj: (username: string, clientInstanceId: string) => void;
  onTransferHost: (username: string, clientInstanceId: string) => void;
  onSendReaction: (emoji: string) => void;
  onInteraction?: () => void;
  portalContainer?: HTMLElement | null;
  dropdownSide?: "top" | "bottom";
  inline?: boolean;
  className?: string;
}

export function KaraokeFullscreenRoomControls({
  session,
  isRemoteOnly,
  isHost,
  isDj,
  isAnonymous,
  listenerCount,
  currentUsername,
  currentClientInstanceId,
  onJoinRoom,
  onLeave,
  onAssignPlaybackDevice,
  onPassDj,
  onTransferHost,
  onSendReaction,
  onInteraction,
  portalContainer,
  dropdownSide = "bottom",
  inline = false,
  className,
}: KaraokeFullscreenRoomControlsProps) {
  const { t } = useTranslation();
  const { isMacOSTheme: isMacTheme } = useThemeFlags();
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);
  const segmentClasses = isMacTheme
    ? "relative overflow-hidden rounded-full shadow-lg flex items-center gap-1 px-1 py-1"
    : "border border-white/10 backdrop-blur-sm rounded-full shadow-lg flex items-center gap-1 px-1 py-1 bg-neutral-800/60";
  const aquaSegmentStyle: CSSProperties = isMacTheme
    ? {
        background:
          "linear-gradient(to bottom, rgba(60, 60, 60, 0.6), rgba(30, 30, 30, 0.5))",
        boxShadow:
          "0 2px 4px rgba(0, 0, 0, 0.2), inset 0 0 0 0.5px rgba(255, 255, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
      }
    : {};
  const iconClasses = isMacTheme
    ? "text-white/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
    : "";
  const buttonClasses = cn(
    "w-8 h-8 flex items-center justify-center rounded-full transition-colors focus:outline-none relative z-10",
    !isMacTheme && "text-white/70 hover:text-white hover:bg-white/10"
  );
  const svgClasses = cn(
    "w-[14px] h-[14px]",
    iconClasses
  );
  const playbackValue = session
    ? makeConnectionKey(
        session.djUsername,
        session.djClientInstanceId ?? `legacy:${session.djUsername.toLowerCase()}`
      )
    : "";
  const isSelfConnection = (u: ListenSession["users"][number]) =>
    u.username === currentUsername && u.clientInstanceId === currentClientInstanceId;

  const handleClick =
    (handler: () => void) => (e: MouseEvent) => {
      e.stopPropagation();
      playClick();
      onInteraction?.();
      handler();
    };

  const roomButton = (
    <button
      type="button"
      onClick={session ? (e) => e.stopPropagation() : handleClick(onJoinRoom)}
      className={cn(buttonClasses, "gap-1 px-2 w-auto")}
      title={
        session
          ? t("apps.karaoke.liveListen.listening", { count: listenerCount })
          : t("apps.karaoke.liveListen.joinSession")
      }
    >
      {session && isDj && (
        <span
          className={cn(
            "px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-white/20",
            iconClasses
          )}
        >
          {t("apps.karaoke.liveListen.playbackBadge")}
        </span>
      )}
      {session && isRemoteOnly && !isDj && (
        <span
          className={cn(
            "px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-amber-500/35",
            iconClasses
          )}
        >
          {t("apps.karaoke.liveListen.remoteBadge")}
        </span>
      )}
      <Headphones weight="fill" className={svgClasses} />
      <span className={cn("text-sm tabular-nums", iconClasses)}>
        {session ? listenerCount : 0}
      </span>
    </button>
  );

  const reactionButton = (
    <button
      type="button"
      disabled={!session || isAnonymous}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        buttonClasses,
        (!session || isAnonymous) && "opacity-[0.42] cursor-default"
      )}
      title={t("apps.karaoke.liveListen.sendReaction")}
    >
      <Smiley weight="fill" className={svgClasses} />
    </button>
  );

  const controls = (
    <>
      {session ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>{roomButton}</DropdownMenuTrigger>
          <DropdownMenuContent
            container={portalContainer}
            side={dropdownSide}
            align="center"
            sideOffset={8}
            className="px-0 w-56"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-2 py-1 text-xs text-muted-foreground">
              {t("apps.karaoke.liveListen.listening", { count: listenerCount })}
              {listenerCount - session.users.length > 0 &&
                ` (${t("apps.karaoke.liveListen.anonymous", {
                  count: listenerCount - session.users.length,
                })})`}
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
                {session.users.reduce<ReactElement[]>((acc, user) => {
                  if (isSelfConnection(user)) return acc;
                  const cid =
                    user.clientInstanceId ??
                    `legacy:${user.username.toLowerCase()}`;
                  acc.push(
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
                  return acc;
                }, [])}
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
              {isHost
                ? t("apps.karaoke.liveListen.endSession")
                : t("apps.karaoke.liveListen.leaveSession")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        roomButton
      )}

      {session && !isAnonymous ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>{reactionButton}</DropdownMenuTrigger>
          <DropdownMenuContent
            container={portalContainer}
            side={dropdownSide}
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
      ) : (
        reactionButton
      )}
    </>
  );

  if (inline) return controls;

  return (
    <div className={cn(segmentClasses, className)} style={aquaSegmentStyle}>
      {controls}
    </div>
  );
}
