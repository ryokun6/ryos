import { ListenSessionToolbar } from "@/components/listen/ListenSessionToolbar";
import type { KaraokeAppController } from "./useKaraokeAppController";

/** Headphones island plus the karaoke queue button. Rendered only in a room. */
export function KaraokeListenChrome({
  c,
  className,
}: {
  c: KaraokeAppController;
  className?: string;
}) {
  if (!c.listenSession) return null;

  return (
    <div
      className={className}
      onClick={(event) => {
        event.stopPropagation();
        c.restartAutoHideTimer();
      }}
    >
      <ListenSessionToolbar
        session={c.listenSession}
        isRemoteOnly={c.isListenSessionRemoteOnly}
        isHost={c.isListenSessionHost}
        isDj={c.isListenSessionDj}
        isAnonymous={c.isListenSessionAnonymous}
        listenerCount={c.listenListenerCount}
        currentUsername={c.listenSessionUsername}
        currentClientInstanceId={c.listenSessionClientInstanceId}
        onShare={() => c.setIsListenInviteOpen(true)}
        onLeave={c.handleLeaveListenSession}
        onAssignPlaybackDevice={c.handleAssignPlaybackDevice}
        onPassDj={c.handlePassDj}
        onTransferHost={c.handleTransferSessionHost}
        onSendReaction={c.handleSendReaction}
        onToggleQueue={() => c.setQueueDrawerOpen((open) => !open)}
        queueCount={c.queueItems.length}
        onInteraction={c.restartAutoHideTimer}
      />
    </div>
  );
}
