import { create } from "zustand";
import type { PusherChannel } from "@/lib/pusherClient";
import { getPusherClient } from "@/lib/pusherClient";
import { toast } from "@/hooks/useToast";
import { useChatsStore } from "@/stores/useChatsStore";
import {
  assignListenSessionDj,
  createListenSession,
  fetchListenSessions,
  joinListenSession,
  leaveListenSession,
  reactListenSession,
  fetchListenSession,
  sendListenRemoteCommand,
  syncListenSession,
  transferListenSessionHost,
  updateListenQueue,
  publishListenLyricOffset,
  claimListenDj,
} from "@/api/listen";
import { getListenClientInstanceId } from "@/lib/listenClientInstance";
import {
  forgetListenSession,
  rememberListenSession,
} from "@/lib/listenSessionMemory";
import { setLyricOffsetPublisher } from "@/lib/lyricOffsetPublish";
import { useIpodStore } from "@/stores/useIpodStore";
import { normalizeLyricOffsetMap } from "@/shared/listen/lyricOffsets";
import { LISTEN_ANALYTICS, track } from "@/utils/analytics";
import { getListenSessionChannelName } from "@/shared/constants/realtime";
import {
  normalizeListenSyncPayload,
  type ListenQueueItem,
  type ListenQueuePayload,
  type ListenQueueRequest,
  type ListenReactionPayload,
  type ListenRemoteCommandAction,
  type ListenRemoteCommandPayload,
  type ListenSession,
  type ListenSessionSummary,
  type ListenSyncPayload,
  type ListenTrackMeta,
} from "@/shared/contracts/listen";
import { normalizeListenSessionQueue } from "@/shared/listen/queue";

export type {
  ListenReactionPayload,
  ListenRemoteCommandAction,
  ListenRemoteCommandPayload,
  ListenSession,
  ListenSessionSummary,
  ListenSyncPayload,
  ListenTrackMeta,
} from "@/shared/contracts/listen";

/** Listener (non-DJ): optimistic play/pause until Pusher shows the host agrees. */
export type PendingRemotePlayback = { desiredIsPlaying: boolean; sinceMs: number };

export interface ListenSessionState {
  currentSession: ListenSession | null;
  username: string | null;
  /** This tab's listen connection id (per-tab sessionStorage) */
  clientInstanceId: string | null;
  anonymousId: string | null; // For anonymous listeners
  isAnonymous: boolean;
  isHost: boolean;
  isDj: boolean;
  isConnected: boolean;
  listenerCount: number; // Total listeners from sync payload
  lastSyncPayload: ListenSyncPayload | null;
  lastSyncAt: number | null;
  reactions: ListenReactionPayload[];
  /** Bumps when the DJ should drain remote-command queue */
  remoteCommandFlushId: number;
  /** Non-DJ only: after remote play/pause, ignore conflicting host isPlaying until confirmed or timeout. */
  pendingRemotePlayback: PendingRemotePlayback | null;

  fetchSessions: () => Promise<{
    ok: boolean;
    sessions?: ListenSessionSummary[];
    error?: string;
  }>;
  createSession: (username: string) => Promise<{
    ok: boolean;
    session?: ListenSession;
    error?: string;
  }>;
  joinSession: (
    sessionId: string,
    username?: string // Optional - if not provided, joins as anonymous
  ) => Promise<{ ok: boolean; session?: ListenSession; error?: string }>;
  leaveSession: () => Promise<{ ok: boolean; error?: string }>;
  syncSession: (payload: {
    currentTrackId: string | null;
    currentTrackMeta: ListenTrackMeta | null;
    isPlaying: boolean;
    positionMs: number;
    durationMs?: number;
    djUsername?: string;
    djClientInstanceId?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  sendReaction: (emoji: string) => Promise<{ ok: boolean; error?: string }>;
  clearReactions: () => void;
  transferHost: (
    nextHostUsername: string,
    nextHostClientInstanceId: string
  ) => Promise<{ ok: boolean; error?: string }>;
  assignDj: (
    nextDjUsername: string,
    nextDjClientInstanceId: string
  ) => Promise<{ ok: boolean; error?: string }>;
  sendRemotePlaybackCommand: (args: {
    action: ListenRemoteCommandAction;
    positionMs?: number;
    trackId?: string;
    trackMeta?: ListenTrackMeta;
  }) => Promise<{ ok: boolean; error?: string }>;
  takeRemoteCommands: () => ListenRemoteCommandPayload[];
  updateQueue: (
    args: Pick<
      ListenQueueRequest,
      "op" | "trackId" | "title" | "artist" | "entryId" | "endedTrackId"
    >
  ) => Promise<{
    ok: boolean;
    error?: string;
    queue?: ListenQueueItem[];
    advanced?: boolean;
    item?: ListenQueueItem | null;
    alreadyAdvanced?: boolean;
    libraryFallback?: boolean;
    djStale?: boolean;
    pending?: boolean;
  }>;
  playbackCatchUp: boolean;
  clearPlaybackCatchUp: () => void;
  refreshSession: () => Promise<void>;
  claimStaleDj: () => Promise<{ ok: boolean; claimed?: boolean; error?: string }>;
  publishLyricOffset: (trackId: string, lyricOffset: number) => Promise<void>;
}

const initialState = {
  currentSession: null,
  username: null,
  clientInstanceId: null,
  anonymousId: null,
  isAnonymous: false,
  isHost: false,
  isDj: false,
  isConnected: false,
  listenerCount: 0,
  lastSyncPayload: null,
  lastSyncAt: null,
  reactions: [],
  remoteCommandFlushId: 0,
  pendingRemotePlayback: null,
  playbackCatchUp: false,
};

function payloadFromSession(session: ListenSession, listenerCount: number): ListenSyncPayload {
  return {
    currentTrackId: session.currentTrackId,
    currentTrackMeta: session.currentTrackMeta,
    isPlaying: session.isPlaying,
    positionMs: session.positionMs,
    timestamp: session.lastSyncAt,
    hostUsername: session.hostUsername,
    hostClientInstanceId: session.hostClientInstanceId,
    djUsername: session.djUsername,
    djClientInstanceId: session.djClientInstanceId,
    listenerCount,
    sourceUsername: session.djUsername,
    sourceClientInstanceId: session.djClientInstanceId,
    queue: session.queue,
    queueVersion: session.queueVersion,
    durationMs: session.currentTrackDurationMs,
    lyricOffsets: normalizeLyricOffsetMap(session.lyricOffsets),
  };
}

function applySharedOffsets(offsets: Record<string, number> | undefined): void {
  if (!offsets) return;
  const library = useIpodStore.getState();
  for (const [trackId, offset] of Object.entries(offsets)) {
    library.applySharedLyricOffset(trackId, offset);
  }
}

let remoteCommandBuffer: ListenRemoteCommandPayload[] = [];

// Generate a random anonymous ID
function generateAnonymousId(): string {
  return `anon-${Math.random().toString(36).substring(2, 10)}`;
}

function hasMatchingAuth(username: string): boolean {
  const { username: authUsername, isAuthenticated } = useChatsStore.getState();
  if (!authUsername || !isAuthenticated) return false;
  return authUsername.toLowerCase() === username.toLowerCase();
}

let pusherClient: ReturnType<typeof getPusherClient> | null = null;
let channelRef: PusherChannel | null = null;

function ensurePusherClient(): ReturnType<typeof getPusherClient> {
  if (!pusherClient) {
    pusherClient = getPusherClient();
  }
  return pusherClient;
}

function updateIdentityFlags(
  session: ListenSession | null,
  username: string | null,
  clientInstanceId: string | null
): { isHost: boolean; isDj: boolean } {
  if (!session || !username || !clientInstanceId) {
    return { isHost: false, isDj: false };
  }
  const hostMatch =
    session.hostUsername === username &&
    session.hostClientInstanceId === clientInstanceId;
  const djMatch =
    session.djUsername === username &&
    session.djClientInstanceId === clientInstanceId;
  return {
    isHost: hostMatch,
    isDj: djMatch,
  };
}

function withQueue(session: ListenSession): ListenSession {
  return normalizeListenSessionQueue(session);
}

function applyQueueSnapshot(
  session: ListenSession,
  queue: ListenQueueItem[] | undefined,
  queueVersion: number | undefined
): ListenSession {
  if (!Array.isArray(queue) || typeof queueVersion !== "number") return session;
  const local = session.queueVersion ?? 0;
  if (queueVersion < local) return session;
  return { ...session, queue, queueVersion };
}

function unsubscribeFromSession(): void {
  remoteCommandBuffer = [];
  if (pusherClient && channelRef) {
    pusherClient.unsubscribe(channelRef.name);
  }
  channelRef = null;
}

export const useListenSessionStore = create<ListenSessionState>((set, get) => {
  const applyOptimisticRemotePlayback = (
    desiredIsPlaying: boolean,
    positionMs?: number
  ) => {
    const nextPositionMs =
      typeof positionMs === "number"
        ? Math.max(0, Math.floor(positionMs))
        : Math.max(0, get().lastSyncPayload?.positionMs ?? 0);

    set((state) => {
      if (!state.lastSyncPayload || !state.currentSession) return {};

      const prevTs = Math.max(
        state.lastSyncAt ?? 0,
        state.lastSyncPayload.timestamp ?? 0
      );
      const mergedTs = Math.max(Date.now(), prevTs + 1);
      const merged: ListenSyncPayload = {
        ...state.lastSyncPayload,
        isPlaying: desiredIsPlaying,
        positionMs: nextPositionMs,
        timestamp: mergedTs,
      };
      const nextSession: ListenSession = {
        ...state.currentSession,
        isPlaying: desiredIsPlaying,
        positionMs: nextPositionMs,
        lastSyncAt: merged.timestamp,
      };

      return {
        lastSyncPayload: merged,
        lastSyncAt: merged.timestamp,
        currentSession: nextSession,
        pendingRemotePlayback: {
          desiredIsPlaying,
          sinceMs: Date.now(),
        },
      };
    });
  };

  const bindChannelEvents = (sessionId: string) => {
    const client = ensurePusherClient();

    if (channelRef && channelRef.name !== getListenSessionChannelName(sessionId)) {
      client.unsubscribe(channelRef.name);
      channelRef = null;
    }

    if (!channelRef) {
      channelRef = client.subscribe(getListenSessionChannelName(sessionId));
    }

    channelRef.unbind("sync");
    channelRef.unbind("user-joined");
    channelRef.unbind("user-left");
    channelRef.unbind("dj-changed");
    channelRef.unbind("host-changed");
    channelRef.unbind("dj-disconnected");
    channelRef.unbind("reaction");
    channelRef.unbind("session-ended");
    channelRef.unbind("queue");
    channelRef.unbind("lyric-offset");
    channelRef.unbind("pusher:subscription_succeeded");

    channelRef.bind("sync", (payload: ListenSyncPayload) => {
      const normalized = normalizeListenSyncPayload(payload);
      applySharedOffsets(normalized.lyricOffsets);
      set((state) => {
        if (!state.currentSession) return {};
        const prevTs = Math.max(
          state.lastSyncAt ?? 0,
          state.lastSyncPayload?.timestamp ?? 0
        );
        // Drop out-of-order syncs (e.g. stale broadcast after optimistic remote play/pause).
        if (normalized.timestamp < prevTs) {
          return {};
        }

        const pending = state.pendingRemotePlayback;
        let effective = normalized;
        let pendingNext: PendingRemotePlayback | null = pending;

        // Listeners: host sync can arrive with a newer timestamp but stale isPlaying (heartbeat
        // before the DJ applied the remote command). Keep desired play/pause until host agrees.
        if (pending && !state.isDj) {
          const age = Date.now() - pending.sinceMs;
          if (normalized.isPlaying === pending.desiredIsPlaying) {
            pendingNext = null;
          } else if (age < 5000) {
            effective = {
              ...normalized,
              isPlaying: pending.desiredIsPlaying,
            };
          } else {
            pendingNext = null;
          }
        }

        const nextSession: ListenSession = applyQueueSnapshot(
          {
            ...state.currentSession,
            currentTrackId: effective.currentTrackId,
            currentTrackMeta: effective.currentTrackMeta,
            isPlaying: effective.isPlaying,
            positionMs: effective.positionMs,
            lastSyncAt: effective.timestamp,
            ...(effective.hostUsername != null
              ? { hostUsername: effective.hostUsername }
              : {}),
            ...(effective.hostClientInstanceId != null
              ? { hostClientInstanceId: effective.hostClientInstanceId }
              : {}),
            djUsername: effective.djUsername,
            ...(effective.djClientInstanceId != null
              ? { djClientInstanceId: effective.djClientInstanceId }
              : {}),
            ...(effective.durationMs != null
              ? { currentTrackDurationMs: effective.durationMs }
              : {}),
            ...(effective.lyricOffsets
              ? { lyricOffsets: effective.lyricOffsets }
              : {}),
          },
          effective.queue,
          effective.queueVersion
        );
        return {
          currentSession: nextSession,
          lastSyncPayload: effective,
          lastSyncAt: effective.timestamp,
          listenerCount: effective.listenerCount ?? state.listenerCount,
          pendingRemotePlayback: pendingNext,
          ...updateIdentityFlags(
            nextSession,
            state.username,
            state.clientInstanceId
          ),
        };
      });
    });

    channelRef.bind(
      "user-joined",
      ({
        username,
        clientInstanceId,
      }: {
        username: string;
        clientInstanceId?: string;
      }) => {
        set((state) => {
          if (!state.currentSession) return {};
          const cid =
            clientInstanceId ??
            `legacy:${username.toLowerCase()}`;
          const existingIndex = state.currentSession.users.findIndex(
            (user) =>
              user.username === username && user.clientInstanceId === cid
          );
          const users = [...state.currentSession.users];
          if (existingIndex === -1) {
            users.push({
              username,
              joinedAt: Date.now(),
              isOnline: true,
              clientInstanceId: cid,
            });
          } else {
            users[existingIndex] = {
              ...users[existingIndex],
              isOnline: true,
              clientInstanceId: cid,
            };
          }
          users.sort((a, b) => a.joinedAt - b.joinedAt);
          return {
            currentSession: {
              ...state.currentSession,
              users,
            },
          };
        });
      }
    );

    channelRef.bind(
      "user-left",
      ({
        username,
        clientInstanceId,
      }: {
        username: string;
        clientInstanceId?: string;
      }) => {
        set((state) => {
          if (!state.currentSession) return {};
          const cid =
            clientInstanceId ??
            `legacy:${username.toLowerCase()}`;
          const users = state.currentSession.users.filter(
            (user) =>
              !(
                user.username === username &&
                user.clientInstanceId === cid
              )
          );
          return {
            currentSession: {
              ...state.currentSession,
              users,
            },
          };
        });
      }
    );

    channelRef.bind(
      "dj-changed",
      ({
        previousDj,
        newDj,
        newDjClientInstanceId,
      }: {
        previousDj: string;
        newDj: string;
        newDjClientInstanceId?: string;
      }) => {
        remoteCommandBuffer = [];
        set((state) => {
          if (!state.currentSession) return {};
          const djConn = state.currentSession.users.find(
            (u) => u.username === newDj
          );
          const nextSession = {
            ...state.currentSession,
            djUsername: newDj,
            djClientInstanceId:
              newDjClientInstanceId ??
              djConn?.clientInstanceId ??
              `legacy:${newDj.toLowerCase()}`,
          };
          if (
            state.username === newDj &&
            state.clientInstanceId === nextSession.djClientInstanceId
          ) {
            toast("Playback is on this device", {
              description: `Transferred from @${previousDj}`,
            });
          }
          return {
            currentSession: nextSession,
            ...updateIdentityFlags(
              nextSession,
              state.username,
              state.clientInstanceId
            ),
          };
        });
      }
    );

    channelRef.bind(
      "host-changed",
      ({
        previousHost,
        newHost,
        newHostClientInstanceId,
      }: {
        previousHost: string;
        newHost: string;
        newHostClientInstanceId?: string;
      }) => {
        remoteCommandBuffer = [];
        set((state) => {
          if (!state.currentSession) return {};
          const hostConn = state.currentSession.users.find(
            (u) => u.username === newHost
          );
          const nextSession = {
            ...state.currentSession,
            hostUsername: newHost,
            hostClientInstanceId:
              newHostClientInstanceId ??
              hostConn?.clientInstanceId ??
              `legacy:${newHost.toLowerCase()}`,
          };
          if (
            state.username === newHost &&
            state.clientInstanceId === nextSession.hostClientInstanceId
          ) {
            toast("You're the host now", {
              description: `Host transferred from @${previousHost}`,
            });
          }
          return {
            currentSession: nextSession,
            ...updateIdentityFlags(
              nextSession,
              state.username,
              state.clientInstanceId
            ),
          };
        });
      }
    );

    channelRef.bind("remote-command", (payload: ListenRemoteCommandPayload) => {
      const st = get();
      if (!st.currentSession || !st.isDj) return;
      if (
        payload.fromUsername === st.username &&
        payload.fromClientInstanceId === st.clientInstanceId
      ) {
        return;
      }
      remoteCommandBuffer.push(payload);
      set({ remoteCommandFlushId: st.remoteCommandFlushId + 1 });
    });

    channelRef.bind("queue", (payload: ListenQueuePayload) => {
      set((state) => {
        if (!state.currentSession || !payload) return {};
        return {
          currentSession: applyQueueSnapshot(
            state.currentSession,
            payload.queue,
            payload.queueVersion
          ),
        };
      });
    });

    channelRef.bind("lyric-offset", (payload: {
      trackId?: string;
      lyricOffset?: number;
    }) => {
      if (!payload?.trackId || typeof payload.lyricOffset !== "number") return;
      const offsets = normalizeLyricOffsetMap({ [payload.trackId]: payload.lyricOffset });
      applySharedOffsets(offsets);
      set((state) => {
        if (!state.currentSession) return {};
        return {
          currentSession: {
            ...state.currentSession,
            lyricOffsets: {
              ...normalizeLyricOffsetMap(state.currentSession.lyricOffsets),
              ...offsets,
            },
          },
        };
      });
    });

    channelRef.bind("pusher:subscription_succeeded", () => {
      void get().refreshSession();
    });

    channelRef.bind("reaction", (payload: ListenReactionPayload) => {
      set((state) => ({
        reactions: [...state.reactions, payload].slice(-40),
      }));
    });

    channelRef.bind("session-ended", () => {
      toast("Session ended", {
        description: "The host ended the listening session.",
      });
      forgetListenSession();
      unsubscribeFromSession();
      set({
        ...initialState,
        clientInstanceId: get().clientInstanceId,
        remoteCommandFlushId: 0,
      });
    });

    channelRef.bind(
      "dj-disconnected",
      ({ djUsername }: { djUsername: string }) => {
        const state = get();
        if (!state.currentSession || state.isDj) return;
        toast.warning("DJ disconnected", {
          description: `@${djUsername} appears to have disconnected.`,
          duration: 8000,
        });
      }
    );
  };

  return {
    ...initialState,

    fetchSessions: async () => {
      try {
        const data = await fetchListenSessions();
        return { ok: true, sessions: data.sessions as ListenSessionSummary[] };
      } catch (error) {
        console.error("[ListenSession] fetchSessions failed", error);
        const message = error instanceof Error ? error.message : "Network error. Please try again.";
        return { ok: false, error: message };
      }
    },

    createSession: async (username: string) => {
      if (!hasMatchingAuth(username)) {
        return { ok: false, error: "Authentication required" };
      }

      try {
        const clientInstanceId = getListenClientInstanceId();
        const data = await createListenSession(username, clientInstanceId);
        const session = withQueue(data.session as ListenSession);
        const identity = updateIdentityFlags(session, username, clientInstanceId);

        remoteCommandBuffer = [];
        bindChannelEvents(session.id);
        rememberListenSession(session.id, username);
        const listenerCount =
          session.users.length + (session.anonymousListeners?.length ?? 0);
        set({
          currentSession: session,
          username,
          clientInstanceId,
          isConnected: true,
          listenerCount,
          lastSyncAt: session.lastSyncAt,
          lastSyncPayload: payloadFromSession(session, listenerCount),
          reactions: [],
          remoteCommandFlushId: 0,
          pendingRemotePlayback: null,
          playbackCatchUp: false,
          ...identity,
        });

        track(LISTEN_ANALYTICS.SESSION_CREATE, {
          listenerCount: session.users.length + (session.anonymousListeners?.length ?? 0),
        });
        return { ok: true, session };
      } catch (error) {
        console.error("[ListenSession] createSession failed", error);
        const message = error instanceof Error ? error.message : "Network error. Please try again.";
        return { ok: false, error: message };
      }
    },

    joinSession: async (sessionId: string, username?: string) => {
      try {
        // If no username, join as anonymous
        const isAnonymous = !username;
        const anonymousId = isAnonymous ? generateAnonymousId() : null;
        const clientInstanceId = isAnonymous ? null : getListenClientInstanceId();

        if (!isAnonymous && username && !hasMatchingAuth(username)) {
          return { ok: false, error: "Authentication required" };
        }

        const data = await joinListenSession(
          sessionId,
          isAnonymous
            ? { anonymousId: anonymousId || undefined }
            : { username, clientInstanceId: clientInstanceId || undefined }
        );
        const session = withQueue(data.session as ListenSession);
        const identity = isAnonymous
          ? { isHost: false, isDj: false }
          : updateIdentityFlags(session, username!, clientInstanceId);

        // Calculate initial listener count
        const listenerCount =
          session.users.length + (session.anonymousListeners?.length ?? 0);

        remoteCommandBuffer = [];
        bindChannelEvents(session.id);
        rememberListenSession(session.id, username ?? null);
        applySharedOffsets(normalizeLyricOffsetMap(session.lyricOffsets));
        const isDj = !isAnonymous && identity.isDj === true;
        set({
          currentSession: session,
          username: username ?? null,
          clientInstanceId,
          anonymousId,
          isAnonymous,
          isConnected: true,
          listenerCount,
          lastSyncAt: session.lastSyncAt,
          lastSyncPayload: payloadFromSession(session, listenerCount),
          reactions: [],
          remoteCommandFlushId: 0,
          pendingRemotePlayback: null,
          playbackCatchUp: Boolean(isDj && session.currentTrackId),
          ...identity,
        });

        track(LISTEN_ANALYTICS.SESSION_JOIN, {
          isAnonymous,
          listenerCount,
        });
        return { ok: true, session };
      } catch (error) {
        console.error("[ListenSession] joinSession failed", error);
        const message = error instanceof Error ? error.message : "Network error. Please try again.";
        return { ok: false, error: message };
      }
    },

    leaveSession: async () => {
      const { currentSession, username, clientInstanceId, anonymousId, isAnonymous } = get();
      if (!currentSession) {
        return { ok: true };
      }

      // Must have either username or anonymousId
      if (!username && !anonymousId) {
        unsubscribeFromSession();
        set({
          ...initialState,
          clientInstanceId: get().clientInstanceId,
        });
        track(LISTEN_ANALYTICS.SESSION_LEAVE, { isAnonymous });
        return { ok: true };
      }

      try {
        if (!isAnonymous && username && !hasMatchingAuth(username)) {
          return { ok: false, error: "Authentication required" };
        }

        await leaveListenSession(
          currentSession.id,
          isAnonymous
            ? { anonymousId: anonymousId || undefined }
            : {
                username: username || undefined,
                clientInstanceId: clientInstanceId || undefined,
              }
        );

        forgetListenSession();
        unsubscribeFromSession();
        set({
          ...initialState,
          clientInstanceId: get().clientInstanceId,
        });
        return { ok: true };
      } catch (error) {
        console.error("[ListenSession] leaveSession failed", error);
        const message = error instanceof Error ? error.message : "Network error. Please try again.";
        return { ok: false, error: message };
      }
    },

    syncSession: async (payload) => {
      const { currentSession, username, clientInstanceId } = get();
      if (!currentSession || !username || !clientInstanceId) {
        return { ok: false, error: "No active session" };
      }

      if (!hasMatchingAuth(username)) {
        return { ok: false, error: "Authentication required" };
      }

      try {
        await syncListenSession(
          currentSession.id,
          {
            username,
            clientInstanceId,
            state: payload,
          }
        );

        return { ok: true };
      } catch (error) {
        console.error("[ListenSession] syncSession failed", error);
        const message = error instanceof Error ? error.message : "Network error. Please try again.";
        return { ok: false, error: message };
      }
    },

    sendReaction: async (emoji: string) => {
      const { currentSession, username, isAnonymous } = get();
      if (!currentSession || !username) {
        return { ok: false, error: "No active session" };
      }

      // Anonymous users cannot send reactions
      if (isAnonymous) {
        return { ok: false, error: "Sign in to send reactions" };
      }

      if (!hasMatchingAuth(username)) {
        return { ok: false, error: "Authentication required" };
      }

      try {
        await reactListenSession(
          currentSession.id,
          { username, emoji }
        );

        track(LISTEN_ANALYTICS.REACTION, { emoji });
        return { ok: true };
      } catch (error) {
        console.error("[ListenSession] sendReaction failed", error);
        const message = error instanceof Error ? error.message : "Network error. Please try again.";
        return { ok: false, error: message };
      }
    },

    clearReactions: () => {
      set({ reactions: [] });
    },

    transferHost: async (nextHostUsername: string, nextHostClientInstanceId: string) => {
      const { currentSession, username, clientInstanceId } = get();
      if (!currentSession || !username || !clientInstanceId) {
        return { ok: false, error: "No active session" };
      }
      if (!hasMatchingAuth(username)) {
        return { ok: false, error: "Authentication required" };
      }
      try {
        const data = await transferListenSessionHost(currentSession.id, {
          username,
          clientInstanceId,
          nextHostUsername,
          nextHostClientInstanceId,
        });
        const session = withQueue(data.session as ListenSession);
        set({
          currentSession: session,
          ...updateIdentityFlags(session, username, clientInstanceId),
        });
        track(LISTEN_ANALYTICS.TRANSFER_HOST);
        return { ok: true };
      } catch (error) {
        console.error("[ListenSession] transferHost failed", error);
        const message = error instanceof Error ? error.message : "Network error. Please try again.";
        return { ok: false, error: message };
      }
    },

    assignDj: async (nextDjUsername: string, nextDjClientInstanceId: string) => {
      const { currentSession, username, clientInstanceId } = get();
      if (!currentSession || !username || !clientInstanceId) {
        return { ok: false, error: "No active session" };
      }
      if (!hasMatchingAuth(username)) {
        return { ok: false, error: "Authentication required" };
      }
      try {
        const data = await assignListenSessionDj(currentSession.id, {
          username,
          clientInstanceId,
          nextDjUsername,
          nextDjClientInstanceId,
        });
        const session = withQueue(data.session as ListenSession);
        set({
          currentSession: session,
          ...updateIdentityFlags(session, username, clientInstanceId),
        });
        track(LISTEN_ANALYTICS.ASSIGN_DJ);
        return { ok: true };
      } catch (error) {
        console.error("[ListenSession] assignDj failed", error);
        const message = error instanceof Error ? error.message : "Network error. Please try again.";
        return { ok: false, error: message };
      }
    },

    sendRemotePlaybackCommand: async (args) => {
      const { currentSession, username, clientInstanceId, isDj, isAnonymous } = get();
      if (!currentSession || !username || !clientInstanceId) {
        return { ok: false, error: "No active session" };
      }
      if (isAnonymous) {
        return { ok: false, error: "Sign in to control playback" };
      }
      if (isDj) {
        return { ok: false, error: "Use local controls on the playback device" };
      }
      if (!hasMatchingAuth(username)) {
        return { ok: false, error: "Authentication required" };
      }
      try {
        await sendListenRemoteCommand(currentSession.id, {
          username,
          fromClientInstanceId: clientInstanceId,
          ...args,
        });
        // Listeners don't control local playback; UI + virtual clock read lastSyncPayload.
        // Merge play/pause/seek immediately so playback state doesn't wait for the next Pusher sync.
        if (args.action === "play" || args.action === "pause" || args.action === "seek") {
          applyOptimisticRemotePlayback(args.action !== "pause", args.positionMs);
        }
        track(LISTEN_ANALYTICS.REMOTE_COMMAND, { action: args.action });
        return { ok: true };
      } catch (error) {
        console.error("[ListenSession] sendRemotePlaybackCommand failed", error);
        const message = error instanceof Error ? error.message : "Network error. Please try again.";
        return { ok: false, error: message };
      }
    },

    takeRemoteCommands: () => {
      const out = remoteCommandBuffer;
      remoteCommandBuffer = [];
      return out;
    },

    clearPlaybackCatchUp: () => set({ playbackCatchUp: false }),

    refreshSession: async () => {
      const current = get().currentSession;
      if (!current) return;
      try {
        const data = await fetchListenSession(current.id);
        const fresh = withQueue(data.session as ListenSession);
        applySharedOffsets(normalizeLyricOffsetMap(fresh.lyricOffsets));
        set((state) => {
          if (!state.currentSession || state.currentSession.id !== fresh.id) return {};
          const localTs = Math.max(
            state.lastSyncAt ?? 0,
            state.lastSyncPayload?.timestamp ?? 0
          );
          const queued = applyQueueSnapshot(
            state.currentSession,
            fresh.queue,
            fresh.queueVersion
          );
          if (fresh.lastSyncAt < localTs) {
            return { currentSession: queued };
          }
          const listenerCount =
            fresh.users.length + (fresh.anonymousListeners?.length ?? 0);
          const nextSession: ListenSession = {
            ...queued,
            currentTrackId: fresh.currentTrackId,
            currentTrackMeta: fresh.currentTrackMeta,
            isPlaying: fresh.isPlaying,
            positionMs: fresh.positionMs,
            lastSyncAt: fresh.lastSyncAt,
            currentTrackDurationMs: fresh.currentTrackDurationMs,
            lyricOffsets: normalizeLyricOffsetMap(fresh.lyricOffsets),
            djUsername: fresh.djUsername,
            djClientInstanceId: fresh.djClientInstanceId,
            hostUsername: fresh.hostUsername,
            hostClientInstanceId: fresh.hostClientInstanceId,
          };
          return {
            currentSession: nextSession,
            lastSyncPayload: payloadFromSession(nextSession, listenerCount),
            lastSyncAt: fresh.lastSyncAt,
            listenerCount,
            ...updateIdentityFlags(nextSession, state.username, state.clientInstanceId),
          };
        });
      } catch {
        // The next sync or resubscribe retries.
      }
    },

    claimStaleDj: async () => {
      const { currentSession, username, clientInstanceId, isAnonymous } = get();
      if (!currentSession || !username || !clientInstanceId || isAnonymous) {
        return { ok: false, error: "not_in_session" };
      }
      if (!hasMatchingAuth(username)) {
        return { ok: false, error: "Authentication required" };
      }
      try {
        const data = await claimListenDj(currentSession.id, {
          username,
          clientInstanceId,
        });
        const session = withQueue(data.session as ListenSession);
        set({
          currentSession: session,
          ...updateIdentityFlags(session, username, clientInstanceId),
        });
        return { ok: true, claimed: data.claimed === true };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Network error";
        return { ok: false, error: message };
      }
    },

    publishLyricOffset: async (trackId, lyricOffset) => {
      const { currentSession, username, clientInstanceId, isAnonymous } = get();
      if (!currentSession || !username || !clientInstanceId || isAnonymous) return;
      if (!hasMatchingAuth(username)) return;
      try {
        await publishListenLyricOffset(currentSession.id, {
          username,
          clientInstanceId,
          trackId,
          lyricOffset,
        });
        set((state) => {
          if (!state.currentSession) return {};
          return {
            currentSession: {
              ...state.currentSession,
              lyricOffsets: {
                ...normalizeLyricOffsetMap(state.currentSession.lyricOffsets),
                [trackId]: lyricOffset,
              },
            },
          };
        });
      } catch (error) {
        console.error("[ListenSession] publishLyricOffset failed", error);
      }
    },

    updateQueue: async (args) => {
      const { currentSession, username, clientInstanceId, isAnonymous } = get();
      if (!currentSession || !username || !clientInstanceId) {
        return { ok: false, error: "not_in_session" };
      }
      if (isAnonymous) {
        return { ok: false, error: "not_in_session" };
      }
      if (!hasMatchingAuth(username)) {
        return { ok: false, error: "not_in_session" };
      }
      try {
        const data = await updateListenQueue(currentSession.id, {
          username,
          clientInstanceId,
          ...args,
        });
        set((state) => {
          if (!state.currentSession || state.currentSession.id !== currentSession.id) {
            return {};
          }
          return {
            currentSession: applyQueueSnapshot(
              state.currentSession,
              data.queue,
              data.queueVersion
            ),
          };
        });
        return {
          ok: true,
          queue: data.queue,
          advanced: data.advanced,
          item: data.item,
          alreadyAdvanced: data.alreadyAdvanced,
          libraryFallback: data.libraryFallback,
          djStale: data.djStale,
          pending: data.pending,
        };
      } catch (error) {
        console.error("[ListenSession] updateQueue failed", error);
        const message = error instanceof Error ? error.message : "Network error. Please try again.";
        return { ok: false, error: message };
      }
    },
  };
});

const lyricOffsetPublishTimers = new Map<string, ReturnType<typeof setTimeout>>();
setLyricOffsetPublisher((trackId, lyricOffset) => {
  const existing = lyricOffsetPublishTimers.get(trackId);
  if (existing) clearTimeout(existing);
  lyricOffsetPublishTimers.set(
    trackId,
    setTimeout(() => {
      lyricOffsetPublishTimers.delete(trackId);
      void useListenSessionStore.getState().publishLyricOffset(trackId, lyricOffset);
    }, 200)
  );
});
