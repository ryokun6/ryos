import { create } from "zustand";
import type { PusherChannel } from "@/lib/pusherClient";
import { getPusherClient } from "@/lib/pusherClient";
import { getApiUrl } from "@/utils/platform";
import { toast } from "@/hooks/useToast";

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
}

export interface ListenSyncPayload {
  currentTrackId: string | null;
  currentTrackMeta: ListenTrackMeta | null;
  isPlaying: boolean;
  positionMs: number;
  timestamp: number;
}

export interface ListenReactionPayload {
  id: string;
  username: string;
  emoji: string;
  timestamp: number;
}

export interface ListenSessionState {
  currentSession: ListenSession | null;
  username: string | null;
  isHost: boolean;
  isDj: boolean;
  isConnected: boolean;
  lastSyncPayload: ListenSyncPayload | null;
  lastSyncAt: number | null;
  reactions: ListenReactionPayload[];

  createSession: (username: string) => Promise<{
    ok: boolean;
    session?: ListenSession;
    error?: string;
  }>;
  joinSession: (
    sessionId: string,
    username: string
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
}

const initialState = {
  currentSession: null,
  username: null,
  isHost: false,
  isDj: false,
  isConnected: false,
  lastSyncPayload: null,
  lastSyncAt: null,
  reactions: [],
};

let pusherClient: ReturnType<typeof getPusherClient> | null = null;
let channelRef: PusherChannel | null = null;
let activeSessionId: string | null = null;

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
  if (pusherClient && channelRef) {
    pusherClient.unsubscribe(channelRef.name);
  }
  channelRef = null;
  activeSessionId = null;
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

    activeSessionId = sessionId;

    channelRef.unbind("sync");
    channelRef.unbind("user-joined");
    channelRef.unbind("user-left");
    channelRef.unbind("dj-changed");
    channelRef.unbind("reaction");
    channelRef.unbind("session-ended");

    channelRef.bind("sync", (payload: ListenSyncPayload) => {
      set((state) => {
        if (!state.currentSession) return {};
        const nextSession: ListenSession = {
          ...state.currentSession,
          currentTrackId: payload.currentTrackId,
          currentTrackMeta: payload.currentTrackMeta,
          isPlaying: payload.isPlaying,
          positionMs: payload.positionMs,
          lastSyncAt: payload.timestamp,
        };
        return {
          currentSession: nextSession,
          lastSyncPayload: payload,
          lastSyncAt: payload.timestamp,
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
        set((state) => {
          if (!state.currentSession) return {};
          const nextSession = {
            ...state.currentSession,
            djUsername: newDj,
          };
          if (state.username === newDj) {
            toast("You're the DJ now!", {
              description: `DJ control transferred from @${previousDj}`,
            });
          }
          return {
            currentSession: nextSession,
            ...updateIdentityFlags(nextSession, state.username),
          };
        });
      }
    );

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
      set({ ...initialState });
    });
  };

  return {
    ...initialState,

    createSession: async (username: string) => {
      try {
        const response = await fetch(getApiUrl("/api/listen/sessions"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            error: `HTTP error! status: ${response.status}`,
          }));
          return { ok: false, error: errorData.error || "Failed to create session" };
        }

        const data = await response.json();
        const session = data.session as ListenSession;
        const identity = updateIdentityFlags(session, username);

        bindChannelEvents(session.id);
        set({
          currentSession: session,
          username,
          isConnected: true,
          lastSyncAt: session.lastSyncAt,
          lastSyncPayload: null,
          reactions: [],
          ...identity,
        });

        return { ok: true, session };
      } catch (error) {
        console.error("[ListenSession] createSession failed", error);
        return { ok: false, error: "Network error. Please try again." };
      }
    },

    joinSession: async (sessionId: string, username: string) => {
      try {
        const response = await fetch(
          getApiUrl(`/api/listen/sessions/${encodeURIComponent(sessionId)}/join`),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            error: `HTTP error! status: ${response.status}`,
          }));
          return { ok: false, error: errorData.error || "Failed to join session" };
        }

        const data = await response.json();
        const session = data.session as ListenSession;
        const identity = updateIdentityFlags(session, username);

        bindChannelEvents(session.id);
        set({
          currentSession: session,
          username,
          isConnected: true,
          lastSyncAt: session.lastSyncAt,
          lastSyncPayload: null,
          reactions: [],
          ...identity,
        });

        return { ok: true, session };
      } catch (error) {
        console.error("[ListenSession] joinSession failed", error);
        return { ok: false, error: "Network error. Please try again." };
      }
    },

    leaveSession: async () => {
      const { currentSession, username } = get();
      if (!currentSession || !username) {
        return { ok: true };
      }

      try {
        const response = await fetch(
          getApiUrl(`/api/listen/sessions/${encodeURIComponent(currentSession.id)}/leave`),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            error: `HTTP error! status: ${response.status}`,
          }));
          return { ok: false, error: errorData.error || "Failed to leave session" };
        }

        unsubscribeFromSession();
        set({ ...initialState });
        return { ok: true };
      } catch (error) {
        console.error("[ListenSession] leaveSession failed", error);
        return { ok: false, error: "Network error. Please try again." };
      }
    },

    syncSession: async (payload) => {
      const { currentSession, username } = get();
      if (!currentSession || !username) {
        return { ok: false, error: "No active session" };
      }

      try {
        const response = await fetch(
          getApiUrl(`/api/listen/sessions/${encodeURIComponent(currentSession.id)}/sync`),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username,
              state: payload,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            error: `HTTP error! status: ${response.status}`,
          }));
          return { ok: false, error: errorData.error || "Failed to sync session" };
        }

        return { ok: true };
      } catch (error) {
        console.error("[ListenSession] syncSession failed", error);
        return { ok: false, error: "Network error. Please try again." };
      }
    },

    sendReaction: async (emoji: string) => {
      const { currentSession, username } = get();
      if (!currentSession || !username) {
        return { ok: false, error: "No active session" };
      }

      try {
        const response = await fetch(
          getApiUrl(`/api/listen/sessions/${encodeURIComponent(currentSession.id)}/reaction`),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, emoji }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            error: `HTTP error! status: ${response.status}`,
          }));
          return { ok: false, error: errorData.error || "Failed to send reaction" };
        }

        return { ok: true };
      } catch (error) {
        console.error("[ListenSession] sendReaction failed", error);
        return { ok: false, error: "Network error. Please try again." };
      }
    },

    clearReactions: () => {
      set({ reactions: [] });
    },
  };
});
