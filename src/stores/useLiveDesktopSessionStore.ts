import { create } from "zustand";
import { toast } from "@/hooks/useToast";
import type { PusherChannel } from "@/lib/pusherClient";
import {
  subscribePusherChannel,
  unsubscribePusherChannel,
} from "@/lib/pusherClient";
import { useChatsStore } from "@/stores/useChatsStore";
import type { ApiAuthContext } from "@/api/core";
import {
  createLiveDesktopSession,
  fetchLiveDesktopSessions,
  joinLiveDesktopSession,
  leaveLiveDesktopSession,
  syncLiveDesktopSession,
  type LiveDesktopOperation,
  type LiveDesktopSession,
  type LiveDesktopSessionSummary,
  type LiveDesktopState,
} from "@/api/liveDesktop";

export interface LiveDesktopSyncPayload {
  state: LiveDesktopState;
  timestamp: number;
  syncedBy: string;
  participantCount: number;
}

interface LiveDesktopSessionState {
  currentSession: LiveDesktopSession | null;
  username: string | null;
  isHost: boolean;
  isConnected: boolean;
  participantCount: number;
  lastSyncPayload: LiveDesktopSyncPayload | null;
  lastSyncAt: number | null;

  fetchSessions: () => Promise<{
    ok: boolean;
    sessions?: LiveDesktopSessionSummary[];
    error?: string;
  }>;
  createSession: (username: string) => Promise<{
    ok: boolean;
    session?: LiveDesktopSession;
    error?: string;
  }>;
  joinSession: (
    sessionId: string,
    username: string
  ) => Promise<{ ok: boolean; session?: LiveDesktopSession; error?: string }>;
  leaveSession: () => Promise<{ ok: boolean; error?: string }>;
  syncSession: (state: LiveDesktopState) => Promise<{ ok: boolean; error?: string }>;
}

const initialState = {
  currentSession: null,
  username: null,
  isHost: false,
  isConnected: false,
  participantCount: 0,
  lastSyncPayload: null,
  lastSyncAt: null,
};

function buildSessionAuthContext(username: string): ApiAuthContext | null {
  const { username: authUsername, authToken } = useChatsStore.getState();
  if (!authUsername || !authToken) return null;
  if (authUsername.toLowerCase() !== username.toLowerCase()) return null;

  return {
    username: authUsername,
    token: authToken,
  };
}

function getChannelName(sessionId: string): string {
  return `live-${sessionId}`;
}

function updateIdentityFlags(
  session: LiveDesktopSession | null,
  username: string | null
): { isHost: boolean } {
  if (!session || !username) {
    return { isHost: false };
  }
  return {
    isHost: session.hostUsername === username,
  };
}

let channelRef: PusherChannel | null = null;

function unsubscribeFromSessionChannel(): void {
  if (channelRef) {
    unsubscribePusherChannel(channelRef.name);
  }
  channelRef = null;
}

export const useLiveDesktopSessionStore = create<LiveDesktopSessionState>(
  (set, get) => {
    const bindChannelEvents = (sessionId: string) => {
      const nextChannelName = getChannelName(sessionId);
      if (channelRef && channelRef.name !== nextChannelName) {
        unsubscribePusherChannel(channelRef.name);
        channelRef = null;
      }

      if (!channelRef) {
        channelRef = subscribePusherChannel(nextChannelName);
      }

      channelRef.unbind("sync");
      channelRef.unbind("user-joined");
      channelRef.unbind("user-left");
      channelRef.unbind("session-ended");

      channelRef.bind("sync", (payload: LiveDesktopSyncPayload) => {
        set((state) => {
          if (!state.currentSession) return {};

          const nextSession: LiveDesktopSession = {
            ...state.currentSession,
            state: payload.state,
            lastSyncAt: payload.timestamp,
          };

          return {
            currentSession: nextSession,
            lastSyncPayload: payload,
            lastSyncAt: payload.timestamp,
            participantCount: payload.participantCount ?? state.participantCount,
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
            participantCount: users.length,
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
            participantCount: users.length,
          };
        });
      });

      channelRef.bind("session-ended", () => {
        toast("Live Desktop ended", {
          description: "The host ended this desktop session.",
        });
        unsubscribeFromSessionChannel();
        set({ ...initialState });
      });
    };

    return {
      ...initialState,

      fetchSessions: async () => {
        try {
          const data = await fetchLiveDesktopSessions();
          return { ok: true, sessions: data.sessions };
        } catch (error) {
          console.error("[LiveDesktopSession] fetchSessions failed", error);
          const message =
            error instanceof Error ? error.message : "Network error. Please try again.";
          return { ok: false, error: message };
        }
      },

      createSession: async (username: string) => {
        const auth = buildSessionAuthContext(username);
        if (!auth) {
          return { ok: false, error: "Authentication required" };
        }

        try {
          const data = await createLiveDesktopSession(auth, username);
          const session = data.session;
          const identity = updateIdentityFlags(session, username);

          bindChannelEvents(session.id);
          set({
            currentSession: session,
            username,
            isConnected: true,
            participantCount: session.users.length,
            lastSyncAt: session.lastSyncAt,
            lastSyncPayload: null,
            ...identity,
          });

          return { ok: true, session };
        } catch (error) {
          console.error("[LiveDesktopSession] createSession failed", error);
          const message =
            error instanceof Error ? error.message : "Network error. Please try again.";
          return { ok: false, error: message };
        }
      },

      joinSession: async (sessionId: string, username: string) => {
        const auth = buildSessionAuthContext(username);
        if (!auth) {
          return { ok: false, error: "Authentication required" };
        }

        try {
          const data = await joinLiveDesktopSession(
            sessionId,
            { username },
            auth
          );
          const session = data.session;
          const identity = updateIdentityFlags(session, username);

          bindChannelEvents(session.id);
          set({
            currentSession: session,
            username,
            isConnected: true,
            participantCount: session.users.length,
            lastSyncAt: session.lastSyncAt,
            lastSyncPayload: null,
            ...identity,
          });

          return { ok: true, session };
        } catch (error) {
          console.error("[LiveDesktopSession] joinSession failed", error);
          const message =
            error instanceof Error ? error.message : "Network error. Please try again.";
          return { ok: false, error: message };
        }
      },

      leaveSession: async () => {
        const { currentSession, username } = get();
        if (!currentSession) {
          return { ok: true };
        }

        if (!username) {
          unsubscribeFromSessionChannel();
          set({ ...initialState });
          return { ok: true };
        }

        const auth = buildSessionAuthContext(username);
        if (!auth) {
          return { ok: false, error: "Authentication required" };
        }

        try {
          await leaveLiveDesktopSession(
            currentSession.id,
            { username },
            auth
          );
          unsubscribeFromSessionChannel();
          set({ ...initialState });
          return { ok: true };
        } catch (error) {
          console.error("[LiveDesktopSession] leaveSession failed", error);
          const message =
            error instanceof Error ? error.message : "Network error. Please try again.";
          return { ok: false, error: message };
        }
      },

      syncSession: async (state: LiveDesktopState) => {
        const { currentSession, username } = get();
        if (!currentSession || !username) {
          return { ok: false, error: "No active session" };
        }

        const auth = buildSessionAuthContext(username);
        if (!auth) {
          return { ok: false, error: "Authentication required" };
        }

        try {
          await syncLiveDesktopSession(
            currentSession.id,
            { username, state },
            auth
          );
          return { ok: true };
        } catch (error) {
          console.error("[LiveDesktopSession] syncSession failed", error);
          const message =
            error instanceof Error ? error.message : "Network error. Please try again.";
          return { ok: false, error: message };
        }
      },
    };
  }
);

export function getCurrentLiveDesktopOperation(
  session: LiveDesktopSession | null
): LiveDesktopOperation | null {
  return session?.state?.lastOperation ?? null;
}
