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
  sendListenRemoteCommand,
  syncListenSession,
  transferListenSessionHost,
  type ListenRemoteCommandAction,
} from "@/api/listen";
import { getListenClientInstanceId } from "@/lib/listenClientInstance";
export interface ListenTrackMeta {
  title: string;
  artist?: string;
  cover?: string;
}

export interface ListenSessionUser {
  username: string;
  joinedAt: number;
  isOnline: boolean;
  clientInstanceId?: string;
}

export interface ListenAnonymousListener {
  anonymousId: string;
  joinedAt: number;
}

export interface ListenSession {
  id: string;
  hostUsername: string;
  hostClientInstanceId?: string;
  djUsername: string;
  djClientInstanceId?: string;
  createdAt: number;
  currentTrackId: string | null;
  currentTrackMeta: ListenTrackMeta | null;
  isPlaying: boolean;
  positionMs: number;
  lastSyncAt: number;
  users: ListenSessionUser[];
  anonymousListeners?: ListenAnonymousListener[];
}

export interface ListenRemoteCommandPayload {
  fromUsername: string;
  fromClientInstanceId?: string;
  action: ListenRemoteCommandAction;
  positionMs?: number;
  trackId?: string;
  trackMeta?: ListenTrackMeta;
  timestamp: number;
}

export interface ListenSyncPayload {
  currentTrackId: string | null;
  currentTrackMeta: ListenTrackMeta | null;
  isPlaying: boolean;
  positionMs: number;
  timestamp: number;
  hostUsername?: string;
  hostClientInstanceId?: string;
  djUsername: string;
  djClientInstanceId?: string;
  listenerCount: number; // Total listeners (users + anonymous)
  /** Who produced this revision (omit in older payloads — treated as djUsername) */
  sourceUsername?: string;
  sourceClientInstanceId?: string;
}

export interface ListenReactionPayload {
  id: string;
  username: string;
  emoji: string;
  timestamp: number;
}

export interface ListenSessionSummary {
  id: string;
  hostUsername: string;
  djUsername: string;
  createdAt: number;
  currentTrackMeta: {
    title: string;
    artist?: string;
    cover?: string;
  } | null;
  isPlaying: boolean;
  listenerCount: number;
}

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
};

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

function getChannelName(sessionId: string): string {
  return `listen-${sessionId}`;
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

function unsubscribeFromSession(): void {
  remoteCommandBuffer = [];
  if (pusherClient && channelRef) {
    pusherClient.unsubscribe(channelRef.name);
  }
  channelRef = null;
}

export const useListenSessionStore = create<ListenSessionState>((set, get) => {
  const bindChannelEvents = (sessionId: string) => {
    const client = ensurePusherClient();

    if (channelRef && channelRef.name !== getChannelName(sessionId)) {
      client.unsubscribe(channelRef.name);
      channelRef = null;
    }

    if (!channelRef) {
      channelRef = client.subscribe(getChannelName(sessionId));
    }

    channelRef.unbind("sync");
    channelRef.unbind("user-joined");
    channelRef.unbind("user-left");
    channelRef.unbind("dj-changed");
    channelRef.unbind("dj-disconnected");
    channelRef.unbind("reaction");
    channelRef.unbind("session-ended");

    channelRef.bind("sync", (payload: ListenSyncPayload) => {
      const normalized: ListenSyncPayload = {
        ...payload,
        sourceUsername: payload.sourceUsername ?? payload.djUsername,
      };
      set((state) => {
        if (!state.currentSession) return {};
        const nextSession: ListenSession = {
          ...state.currentSession,
          currentTrackId: normalized.currentTrackId,
          currentTrackMeta: normalized.currentTrackMeta,
          isPlaying: normalized.isPlaying,
          positionMs: normalized.positionMs,
          lastSyncAt: normalized.timestamp,
          ...(normalized.hostUsername != null
            ? { hostUsername: normalized.hostUsername }
            : {}),
          ...(normalized.hostClientInstanceId != null
            ? { hostClientInstanceId: normalized.hostClientInstanceId }
            : {}),
          djUsername: normalized.djUsername,
          ...(normalized.djClientInstanceId != null
            ? { djClientInstanceId: normalized.djClientInstanceId }
            : {}),
        };
        return {
          currentSession: nextSession,
          lastSyncPayload: normalized,
          lastSyncAt: normalized.timestamp,
          listenerCount: normalized.listenerCount ?? state.listenerCount,
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

    channelRef.bind("reaction", (payload: ListenReactionPayload) => {
      set((state) => ({
        reactions: [...state.reactions, payload].slice(-40),
      }));
    });

    channelRef.bind("session-ended", () => {
      toast("Session ended", {
        description: "The host ended the listening session.",
      });
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
        const session = data.session as ListenSession;
        const identity = updateIdentityFlags(session, username, clientInstanceId);

        remoteCommandBuffer = [];
        bindChannelEvents(session.id);
        set({
          currentSession: session,
          username,
          clientInstanceId,
          isConnected: true,
          lastSyncAt: session.lastSyncAt,
          lastSyncPayload: null,
          reactions: [],
          remoteCommandFlushId: 0,
          ...identity,
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
        const session = data.session as ListenSession;
        const identity = isAnonymous
          ? { isHost: false, isDj: false }
          : updateIdentityFlags(session, username!, clientInstanceId);

        // Calculate initial listener count
        const listenerCount =
          session.users.length + (session.anonymousListeners?.length ?? 0);

        remoteCommandBuffer = [];
        bindChannelEvents(session.id);
        set({
          currentSession: session,
          username: username ?? null,
          clientInstanceId,
          anonymousId,
          isAnonymous,
          isConnected: true,
          listenerCount,
          lastSyncAt: session.lastSyncAt,
          lastSyncPayload: null,
          reactions: [],
          remoteCommandFlushId: 0,
          ...identity,
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
        const session = data.session as ListenSession;
        set({
          currentSession: session,
          ...updateIdentityFlags(session, username, clientInstanceId),
        });
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
        const session = data.session as ListenSession;
        set({
          currentSession: session,
          ...updateIdentityFlags(session, username, clientInstanceId),
        });
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
        // Merge play/pause immediately so isPlaying and position don't wait for the next Pusher sync.
        if (args.action === "play" || args.action === "pause") {
          const nextPlaying = args.action === "play";
          const positionMs =
            typeof args.positionMs === "number"
              ? args.positionMs
              : Math.max(0, get().lastSyncPayload?.positionMs ?? 0);
          set((state) => {
            if (!state.lastSyncPayload || !state.currentSession) return {};
            const merged: ListenSyncPayload = {
              ...state.lastSyncPayload,
              isPlaying: nextPlaying,
              positionMs,
              timestamp: Date.now(),
            };
            const nextSession: ListenSession = {
              ...state.currentSession,
              isPlaying: nextPlaying,
              positionMs,
              lastSyncAt: merged.timestamp,
            };
            return {
              lastSyncPayload: merged,
              lastSyncAt: merged.timestamp,
              currentSession: nextSession,
            };
          });
        }
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
  };
});
