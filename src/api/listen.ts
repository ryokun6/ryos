import { apiRequest } from "@/api/core";

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

export async function fetchListenSessions(): Promise<{ sessions: ListenSessionSummary[] }> {
  return apiRequest<{ sessions: ListenSessionSummary[] }>({
    path: "/api/listen/sessions",
    method: "GET",
  });
}

export async function createListenSession(
  username?: string
): Promise<{ session: ListenSession }> {
  return apiRequest<{ session: ListenSession }, { username?: string }>({
    path: "/api/listen/sessions",
    method: "POST",
    body: username ? { username } : {},
  });
}

export async function joinListenSession(
  sessionId: string,
  payload: { username?: string; anonymousId?: string }
): Promise<{ session: ListenSession }> {
  return apiRequest<{ session: ListenSession }, typeof payload>({
    path: `/api/listen/sessions/${encodeURIComponent(sessionId)}/join`,
    method: "POST",
    body: payload,
  });
}

export async function leaveListenSession(
  sessionId: string,
  payload: { username?: string; anonymousId?: string }
): Promise<{ success: boolean; session?: ListenSession }> {
  return apiRequest<{ success: boolean; session?: ListenSession }, typeof payload>({
    path: `/api/listen/sessions/${encodeURIComponent(sessionId)}/leave`,
    method: "POST",
    body: payload,
  });
}

export async function syncListenSession(
  sessionId: string,
  payload: {
    username?: string;
    state: {
      currentTrackId: string | null;
      currentTrackMeta: ListenTrackMeta | null;
      isPlaying: boolean;
      positionMs: number;
      djUsername?: string;
    };
  }
): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }, typeof payload>({
    path: `/api/listen/sessions/${encodeURIComponent(sessionId)}/sync`,
    method: "POST",
    body: payload,
  });
}

export async function reactListenSession(
  sessionId: string,
  payload: { username?: string; emoji: string }
): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }, typeof payload>({
    path: `/api/listen/sessions/${encodeURIComponent(sessionId)}/reaction`,
    method: "POST",
    body: payload,
  });
}

export type ListenRemoteCommandAction =
  | "play"
  | "pause"
  | "next"
  | "previous"
  | "playTrack";

export async function transferListenSessionHost(
  sessionId: string,
  payload: { username: string; nextHostUsername: string }
): Promise<{ success: boolean; session: ListenSession }> {
  return apiRequest<{ success: boolean; session: ListenSession }, typeof payload>({
    path: `/api/listen/sessions/${encodeURIComponent(sessionId)}/transfer-host`,
    method: "POST",
    body: payload,
  });
}

export async function assignListenSessionDj(
  sessionId: string,
  payload: { username: string; nextDjUsername: string }
): Promise<{ success: boolean; session: ListenSession }> {
  return apiRequest<{ success: boolean; session: ListenSession }, typeof payload>({
    path: `/api/listen/sessions/${encodeURIComponent(sessionId)}/assign-dj`,
    method: "POST",
    body: payload,
  });
}

export async function sendListenRemoteCommand(
  sessionId: string,
  payload: {
    username: string;
    action: ListenRemoteCommandAction;
    positionMs?: number;
    trackId?: string;
    trackMeta?: ListenTrackMeta;
  }
): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }, typeof payload>({
    path: `/api/listen/sessions/${encodeURIComponent(sessionId)}/remote-command`,
    method: "POST",
    body: payload,
  });
}

