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
  djUsername: string; // Sender identification to ignore own syncs
  listenerCount: number; // Total listeners (users + anonymous) for UI display
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
