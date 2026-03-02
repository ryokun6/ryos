/**
 * Shared realtime session types used by collaborative APIs.
 * These types are intentionally generic so individual features
 * (listen together, live desktop, etc.) can compose feature-specific state.
 */

export interface RealtimeSessionUser {
  username: string;
  joinedAt: number;
  isOnline: boolean;
}

export interface RealtimeSessionBase<TState = unknown> {
  id: string;
  hostUsername: string;
  createdAt: number;
  lastSyncAt: number;
  users: RealtimeSessionUser[];
  state: TState;
}

export interface RealtimeSessionSummaryBase {
  id: string;
  hostUsername: string;
  createdAt: number;
  participantCount: number;
}
