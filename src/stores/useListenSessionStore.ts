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
export interface ListenTrackMeta {
  title: string;
  artist?: string;
  cover?: string;
}

export interface ListenSessionUser {
  username: string;
  joinedAt: number;
  isOnline: boolean;
}

export interface ListenAnonymousListener {
  anonymousId: string;
  joinedAt: number;
}

export interface ListenSession {
  id: string;
  hostUsername: string;
  djUsername: string;
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
  djUsername: string;
  listenerCount: number; // Total listeners (users + anonymous)
  /** Who produced this revision (omit in older payloads — treated as djUsername) */
  sourceUsername?: string;
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
  }) => Promise<{ ok: boolean; error?: string }>;
  sendReaction: (emoji: string) => Promise<{ ok: boolean; error?: string }>;
  clearReactions: () => void;
  transferHost: (nextHostUsername: string) => Promise<{ ok: boolean; error?: string }>;
  assignDj: (nextDjUsername: string) => Promise<{ ok: boolean; error?: string }>;
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
  username: string | null
): { isHost: boolean; isDj: boolean } {
  if (!session || !username) {
    return { isHost: false, isDj: false };
  }
  return {
    isHost: session.hostUsername === username,
    isDj: session.djUsername === username,
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
        };
        return {
          currentSession: nextSession,
          lastSyncPayload: normalized,
          lastSyncAt: normalized.timestamp,
          listenerCount: normalized.listenerCount ?? state.listenerCount,
          ...updateIdentityFlags(nextSession, state.username),
        };
      });
    });

    channelRef.bind("user-joined", ({ username }: { username: string }) => {
      set((state) => {
        if (!state.currentSession) return {};
        const existingIndex = state.currentSession.users.findIndex(
          (user) => user.username === username
        );
        const users = [...state.currentSession.users];
        if (existingIndex === -1) {
          users.push({
            username,
            joinedAt: Date.now(),
            isOnline: true,
          });
        } else {
          users[existingIndex] = {
            ...users[existingIndex],
            isOnline: true,
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
    });

    channelRef.bind("user-left", ({ username }: { username: string }) => {
      set((state) => {
        if (!state.currentSession) return {};
        const users = state.currentSession.users.filter(
          (user) => user.username !== username
        );
        return {
          currentSession: {
            ...state.currentSession,
            users,
          },
        };
      });
    });

    channelRef.bind(
      "dj-changed",
      ({ previousDj, newDj }: { previousDj: string; newDj: string }) => {
        remoteCommandBuffer = [];
        set((state) => {
          if (!state.currentSession) return {};
          const nextSession = {
            ...state.currentSession,
            djUsername: newDj,
          };
          if (state.username === newDj) {
            toast("Playback is on this device", {
              description: `Transferred from @${previousDj}`,
            });
          }
          return {
            currentSession: nextSession,
            ...updateIdentityFlags(nextSession, state.username),
          };
        });
      }
    );

    channelRef.bind(
      "host-changed",
      ({ previousHost, newHost }: { previousHost: string; newHost: string }) => {
        remoteCommandBuffer = [];
        set((state) => {
          if (!state.currentSession) return {};
          const nextSession = {
            ...state.currentSession,
            hostUsername: newHost,
          };
          if (state.username === newHost) {
            toast("You're the host now", {
              description: `Host transferred from @${previousHost}`,
            });
          }
          return {
            currentSession: nextSession,
            ...updateIdentityFlags(nextSession, state.username),
          };
        });
      }
    );

    channelRef.bind("remote-command", (payload: ListenRemoteCommandPayload) => {
      const st = get();
      if (!st.currentSession || !st.isDj) return;
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
      set({ ...initialState, remoteCommandFlushId: 0 });
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
        const data = await createListenSession(username);
        const session = data.session as ListenSession;
        const identity = updateIdentityFlags(session, username);

        remoteCommandBuffer = [];
        bindChannelEvents(session.id);
        set({
          currentSession: session,
          username,
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

        if (!isAnonymous && username && !hasMatchingAuth(username)) {
          return { ok: false, error: "Authentication required" };
        }

        const data = await joinListenSession(
          sessionId,
          isAnonymous ? { anonymousId: anonymousId || undefined } : { username }
        );
        const session = data.session as ListenSession;
        const identity = isAnonymous
          ? { isHost: false, isDj: false }
          : updateIdentityFlags(session, username!);

        // Calculate initial listener count
        const listenerCount =
          session.users.length + (session.anonymousListeners?.length ?? 0);

        remoteCommandBuffer = [];
        bindChannelEvents(session.id);
        set({
          currentSession: session,
          username: username ?? null,
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
      const { currentSession, username, anonymousId, isAnonymous } = get();
      if (!currentSession) {
        return { ok: true };
      }

      // Must have either username or anonymousId
      if (!username && !anonymousId) {
        unsubscribeFromSession();
        set({ ...initialState });
        return { ok: true };
      }

      try {
        if (!isAnonymous && username && !hasMatchingAuth(username)) {
          return { ok: false, error: "Authentication required" };
        }

        await leaveListenSession(
          currentSession.id,
          isAnonymous ? { anonymousId: anonymousId || undefined } : { username: username || undefined }
        );

        unsubscribeFromSession();
        set({ ...initialState });
        return { ok: true };
      } catch (error) {
        console.error("[ListenSession] leaveSession failed", error);
        const message = error instanceof Error ? error.message : "Network error. Please try again.";
        return { ok: false, error: message };
      }
    },

    syncSession: async (payload) => {
      const { currentSession, username } = get();
      if (!currentSession || !username) {
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

    transferHost: async (nextHostUsername: string) => {
      const { currentSession, username } = get();
      if (!currentSession || !username) {
        return { ok: false, error: "No active session" };
      }
      if (!hasMatchingAuth(username)) {
        return { ok: false, error: "Authentication required" };
      }
      try {
        const data = await transferListenSessionHost(currentSession.id, {
          username,
          nextHostUsername,
        });
        const session = data.session as ListenSession;
        set({
          currentSession: session,
          ...updateIdentityFlags(session, username),
        });
        return { ok: true };
      } catch (error) {
        console.error("[ListenSession] transferHost failed", error);
        const message = error instanceof Error ? error.message : "Network error. Please try again.";
        return { ok: false, error: message };
      }
    },

    assignDj: async (nextDjUsername: string) => {
      const { currentSession, username } = get();
      if (!currentSession || !username) {
        return { ok: false, error: "No active session" };
      }
      if (!hasMatchingAuth(username)) {
        return { ok: false, error: "Authentication required" };
      }
      try {
        const data = await assignListenSessionDj(currentSession.id, {
          username,
          nextDjUsername,
        });
        const session = data.session as ListenSession;
        set({
          currentSession: session,
          ...updateIdentityFlags(session, username),
        });
        return { ok: true };
      } catch (error) {
        console.error("[ListenSession] assignDj failed", error);
        const message = error instanceof Error ? error.message : "Network error. Please try again.";
        return { ok: false, error: message };
      }
    },

    sendRemotePlaybackCommand: async (args) => {
      const { currentSession, username, isDj, isAnonymous } = get();
      if (!currentSession || !username) {
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
          ...args,
        });
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
