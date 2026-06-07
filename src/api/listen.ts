import { apiRequest } from "@/api/core";
import type {
  AssignDjRequest,
  CreateSessionRequest,
  JoinSessionRequest,
  LeaveSessionRequest,
  ListenRemoteCommandAction,
  ListenSession,
  ListenSessionResponse,
  ListenSessionSummary,
  ListenSuccessResponse,
  ListenTrackMeta,
  ReactionRequest,
  RemoteCommandRequest,
  SyncSessionRequest,
  TransferHostRequest,
} from "@/shared/contracts/listen";

export type {
  AssignDjRequest,
  CreateSessionRequest,
  JoinSessionRequest,
  LeaveSessionRequest,
  ListenRemoteCommandAction,
  ListenSession,
  ListenSessionResponse,
  ListenSessionSummary,
  ListenSuccessResponse,
  ListenTrackMeta,
  ReactionRequest,
  RemoteCommandRequest,
  SyncSessionRequest,
  TransferHostRequest,
} from "@/shared/contracts/listen";

export async function fetchListenSessions(): Promise<{ sessions: ListenSessionSummary[] }> {
  return apiRequest<{ sessions: ListenSessionSummary[] }>({
    path: "/api/listen/sessions",
    method: "GET",
  });
}

export async function createListenSession(
  username?: string,
  clientInstanceId?: string
): Promise<ListenSessionResponse> {
  const body: CreateSessionRequest = username ? { username, clientInstanceId } : {};
  return apiRequest<ListenSessionResponse, CreateSessionRequest>({
    path: "/api/listen/sessions",
    method: "POST",
    body,
  });
}

export async function joinListenSession(
  sessionId: string,
  payload: JoinSessionRequest
): Promise<ListenSessionResponse> {
  return apiRequest<ListenSessionResponse, JoinSessionRequest>({
    path: `/api/listen/sessions/${encodeURIComponent(sessionId)}/join`,
    method: "POST",
    body: payload,
  });
}

export async function leaveListenSession(
  sessionId: string,
  payload: LeaveSessionRequest
): Promise<ListenSuccessResponse & { session?: ListenSession }> {
  return apiRequest<ListenSuccessResponse & { session?: ListenSession }, LeaveSessionRequest>({
    path: `/api/listen/sessions/${encodeURIComponent(sessionId)}/leave`,
    method: "POST",
    body: payload,
  });
}

export async function syncListenSession(
  sessionId: string,
  payload: SyncSessionRequest
): Promise<ListenSuccessResponse> {
  return apiRequest<ListenSuccessResponse, SyncSessionRequest>({
    path: `/api/listen/sessions/${encodeURIComponent(sessionId)}/sync`,
    method: "POST",
    body: payload,
  });
}

export async function reactListenSession(
  sessionId: string,
  payload: ReactionRequest
): Promise<ListenSuccessResponse> {
  return apiRequest<ListenSuccessResponse, ReactionRequest>({
    path: `/api/listen/sessions/${encodeURIComponent(sessionId)}/reaction`,
    method: "POST",
    body: payload,
  });
}

export async function transferListenSessionHost(
  sessionId: string,
  payload: TransferHostRequest
): Promise<ListenSuccessResponse & ListenSessionResponse> {
  return apiRequest<ListenSuccessResponse & ListenSessionResponse, TransferHostRequest>({
    path: `/api/listen/sessions/${encodeURIComponent(sessionId)}/transfer-host`,
    method: "POST",
    body: payload,
  });
}

export async function assignListenSessionDj(
  sessionId: string,
  payload: AssignDjRequest
): Promise<ListenSuccessResponse & ListenSessionResponse> {
  return apiRequest<ListenSuccessResponse & ListenSessionResponse, AssignDjRequest>({
    path: `/api/listen/sessions/${encodeURIComponent(sessionId)}/assign-dj`,
    method: "POST",
    body: payload,
  });
}

export async function sendListenRemoteCommand(
  sessionId: string,
  payload: RemoteCommandRequest
): Promise<ListenSuccessResponse> {
  return apiRequest<ListenSuccessResponse, RemoteCommandRequest>({
    path: `/api/listen/sessions/${encodeURIComponent(sessionId)}/remote-command`,
    method: "POST",
    body: payload,
  });
}

