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
  /** Per-tab/per-device id so one account can join multiple times */
  clientInstanceId?: string;
}

export interface ListenAnonymousListener {
  anonymousId: string;
  joinedAt: number;
}

export interface ListenSession {
  id: string;
  hostUsername: string;
  /** Which connection (tab/device) has host controls */
  hostClientInstanceId?: string;
  djUsername: string;
  /** Which connection (tab/device) of djUsername runs playback */
  djClientInstanceId?: string;
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
  /** Required for multi-tab same user; generated per tab on client */
  clientInstanceId?: string;
}

export interface JoinSessionRequest {
  username?: string;      // For logged-in users
  anonymousId?: string;   // For anonymous listeners
  clientInstanceId?: string;
}

export interface LeaveSessionRequest {
  username?: string;      // For logged-in users
  anonymousId?: string;   // For anonymous listeners
  clientInstanceId?: string;
}

export interface SyncSessionRequest {
  username: string;
  /** Must match the tab that is the playback device */
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

export interface TransferHostRequest {
  username: string;
  /** Caller tab id — must match session host connection */
  clientInstanceId?: string;
  nextHostUsername: string;
  nextHostClientInstanceId?: string;
}

export interface AssignDjRequest {
  username: string;
  /** Caller tab id — must match session host connection */
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
  /** For play/pause — optional scrub position; required for seek (player timeline ms) */
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
  hostUsername: string;
  hostClientInstanceId?: string;
  djUsername: string; // Playback device (DJ) — session playback owner
  djClientInstanceId?: string;
  listenerCount: number; // Total listeners (users + anonymous) for UI display
  /** Who triggered this sync revision (DJ when syncing; listener when using remote control) */
  sourceUsername: string;
  /** Connection that called POST /sync (distinguishes same user on multiple tabs) */
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
