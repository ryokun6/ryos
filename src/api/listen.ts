import { apiRequest } from "@/api/core";
import type {
  ListenAnonymousListener,
  ListenRemoteCommandAction,
  ListenSession,
  ListenSessionSummary,
  ListenSessionUser,
  ListenTrackMeta,
} from "@ryos/shared/contracts/listen";

export type {
  ListenTrackMeta,
  ListenSessionUser,
  ListenAnonymousListener,
  ListenSession,
  ListenSessionSummary,
  ListenRemoteCommandAction,
} from "@ryos/shared/contracts/listen";

export async function fetchListenSessions(): Promise<{ sessions: ListenSessionSummary[] }> {
  return apiRequest<{ sessions: ListenSessionSummary[] }>({
    path: "/api/listen/sessions",
    method: "GET",
  });
}

export async function createListenSession(
  username?: string,
  clientInstanceId?: string
): Promise<{ session: ListenSession }> {
  return apiRequest<{ session: ListenSession }, { username?: string; clientInstanceId?: string }>({
    path: "/api/listen/sessions",
    method: "POST",
    body: username ? { username, clientInstanceId } : {},
  });
}

export async function joinListenSession(
  sessionId: string,
  payload: { username?: string; anonymousId?: string; clientInstanceId?: string }
): Promise<{ session: ListenSession }> {
  return apiRequest<{ session: ListenSession }, typeof payload>({
    path: `/api/listen/sessions/${encodeURIComponent(sessionId)}/join`,
    method: "POST",
    body: payload,
  });
}

export async function leaveListenSession(
  sessionId: string,
  payload: { username?: string; anonymousId?: string; clientInstanceId?: string }
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
    clientInstanceId?: string;
    state: {
      currentTrackId: string | null;
      currentTrackMeta: ListenTrackMeta | null;
      isPlaying: boolean;
      positionMs: number;
      djUsername?: string;
      djClientInstanceId?: string;
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

export async function transferListenSessionHost(
  sessionId: string,
  payload: {
    username: string;
    clientInstanceId?: string;
    nextHostUsername: string;
    nextHostClientInstanceId?: string;
  }
): Promise<{ success: boolean; session: ListenSession }> {
  return apiRequest<{ success: boolean; session: ListenSession }, typeof payload>({
    path: `/api/listen/sessions/${encodeURIComponent(sessionId)}/transfer-host`,
    method: "POST",
    body: payload,
  });
}

export async function assignListenSessionDj(
  sessionId: string,
  payload: {
    username: string;
    clientInstanceId?: string;
    nextDjUsername: string;
    nextDjClientInstanceId?: string;
  }
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
    fromClientInstanceId?: string;
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
