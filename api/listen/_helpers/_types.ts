/**
 * TypeScript types for listen-together sessions
 */

// ============================================================================
// Session Types
// ============================================================================

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
  anonymousListeners: ListenAnonymousListener[];
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface CreateSessionRequest {
  username: string;
}

export interface JoinSessionRequest {
  username?: string;      // For logged-in users
  anonymousId?: string;   // For anonymous listeners
}

export interface LeaveSessionRequest {
  username?: string;      // For logged-in users
  anonymousId?: string;   // For anonymous listeners
}

export interface SyncSessionRequest {
  username: string;
  state: {
    currentTrackId: string | null;
    currentTrackMeta: ListenTrackMeta | null;
    isPlaying: boolean;
    positionMs: number;
    djUsername?: string;
  };
}

export interface TransferHostRequest {
  username: string;
  nextHostUsername: string;
}

export interface AssignDjRequest {
  username: string;
  nextDjUsername: string;
}

export type ListenRemoteCommandAction =
  | "play"
  | "pause"
  | "next"
  | "previous"
  | "playTrack";

export interface RemoteCommandRequest {
  username: string;
  action: ListenRemoteCommandAction;
  /** For play/pause — optional scrub position */
  positionMs?: number;
  /** For playTrack */
  trackId?: string;
  trackMeta?: ListenTrackMeta;
}

export interface ReactionRequest {
  username: string;
  emoji: string;
}

export interface ListenSessionResponse {
  session: ListenSession;
}

export interface ListenSuccessResponse {
  success: boolean;
}

// ============================================================================
// Pusher Payloads
// ============================================================================

export interface ListenSyncPayload {
  currentTrackId: string | null;
  currentTrackMeta: ListenTrackMeta | null;
  isPlaying: boolean;
  positionMs: number;
  timestamp: number;
  djUsername: string; // Playback device (DJ) — session playback owner
  listenerCount: number; // Total listeners (users + anonymous) for UI display
  /** Who triggered this sync revision (DJ when syncing; listener when using remote control) */
  sourceUsername: string;
}

export interface ListenReactionPayload {
  id: string;
  username: string;
  emoji: string;
  timestamp: number;
}

export interface ListenUserPayload {
  username: string;
}

export interface ListenDjChangedPayload {
  previousDj: string;
  newDj: string;
}

export interface ListenHostChangedPayload {
  previousHost: string;
  newHost: string;
}

export interface ListenRemoteCommandPayload {
  fromUsername: string;
  action: ListenRemoteCommandAction;
  positionMs?: number;
  trackId?: string;
  trackMeta?: ListenTrackMeta;
  timestamp: number;
}
