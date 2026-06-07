export interface ListenTrackMeta {
  title: string;
  artist?: string;
  cover?: string;
  coverColor?: string;
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

export interface ListenSessionSummary {
  id: string;
  hostUsername: string;
  djUsername: string;
  createdAt: number;
  currentTrackMeta: ListenTrackMeta | null;
  isPlaying: boolean;
  listenerCount: number;
}

export interface ListenPlaybackState {
  currentTrackId: string | null;
  currentTrackMeta: ListenTrackMeta | null;
  isPlaying: boolean;
  positionMs: number;
  djUsername?: string;
  djClientInstanceId?: string;
}

export interface CreateSessionRequest {
  username?: string;
  clientInstanceId?: string;
}

export interface JoinSessionRequest {
  username?: string;
  anonymousId?: string;
  clientInstanceId?: string;
}

export interface LeaveSessionRequest {
  username?: string;
  anonymousId?: string;
  clientInstanceId?: string;
}

export interface SyncSessionRequest {
  username?: string;
  clientInstanceId?: string;
  state: ListenPlaybackState;
}

export interface TransferHostRequest {
  username: string;
  clientInstanceId?: string;
  nextHostUsername: string;
  nextHostClientInstanceId?: string;
}

export interface AssignDjRequest {
  username: string;
  clientInstanceId?: string;
  nextDjUsername: string;
  nextDjClientInstanceId?: string;
}

export type ListenRemoteCommandAction =
  | "play"
  | "pause"
  | "seek"
  | "next"
  | "previous"
  | "playTrack";

export interface RemoteCommandRequest {
  username: string;
  fromClientInstanceId?: string;
  action: ListenRemoteCommandAction;
  positionMs?: number;
  trackId?: string;
  trackMeta?: ListenTrackMeta;
}

export interface ReactionRequest {
  username?: string;
  emoji: string;
}

export interface ListenSessionResponse {
  session: ListenSession;
}

export interface ListenSuccessResponse {
  success: boolean;
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
  listenerCount: number;
  sourceUsername?: string;
  sourceClientInstanceId?: string;
}

export interface ListenReactionPayload {
  id: string;
  username: string;
  emoji: string;
  timestamp: number;
}

export interface ListenUserPayload {
  username: string;
  clientInstanceId?: string;
}

export interface ListenDjChangedPayload {
  previousDj: string;
  newDj: string;
  newDjClientInstanceId?: string;
}

export interface ListenHostChangedPayload {
  previousHost: string;
  newHost: string;
  newHostClientInstanceId?: string;
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

export function normalizeListenSyncPayload(
  payload: ListenSyncPayload
): ListenSyncPayload {
  return {
    ...payload,
    sourceUsername: payload.sourceUsername ?? payload.djUsername,
  };
}
