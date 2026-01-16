/**
 * Shared types for API routes
 */

// =============================================================================
// Auth Types
// =============================================================================

export interface AuthContext {
  valid: boolean;
  username: string | null;
  token: string | null;
  expired?: boolean;
  isAdmin: boolean;
}

export interface TokenInfo {
  token: string;
  createdAt: number | string | null;
}

// =============================================================================
// User Types
// =============================================================================

export interface User {
  username: string;
  lastActive: number;
  banned?: boolean;
  banReason?: string;
  bannedAt?: number;
}

export interface UserProfile extends User {
  messageCount?: number;
  rooms?: { id: string; name: string }[];
}

// =============================================================================
// Room Types
// =============================================================================

export type RoomType = "public" | "private";

export interface Room {
  id: string;
  name: string;
  type?: RoomType;
  createdAt: number;
  userCount: number;
  members?: string[];
}

export interface RoomWithUsers extends Room {
  users: string[];
}

// Re-export for services
export type { RoomWithUsers as RoomDetailed };

// =============================================================================
// Message Types
// =============================================================================

export interface Message {
  id: string;
  roomId: string;
  username: string;
  content: string;
  timestamp: number;
}

// =============================================================================
// Rate Limit Types
// =============================================================================

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
  windowSeconds: number;
  resetSeconds: number;
}

export interface RateLimitConfig {
  key: string;
  limit: number;
  windowSeconds: number;
}

// =============================================================================
// API Response Types
// =============================================================================

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    cursor?: string;
    hasMore: boolean;
    total?: number;
  };
}

// =============================================================================
// Request Handler Types
// =============================================================================

export type Handler = (req: Request) => Promise<Response>;

export type AuthenticatedHandler = (
  req: Request,
  auth: AuthContext
) => Promise<Response>;

// =============================================================================
// Lyrics Source Types (for songs)
// =============================================================================

export interface LyricsSource {
  hash: string;
  albumId: string | number;
  title: string;
  artist: string;
  album?: string;
}

// =============================================================================
// Applet Types
// =============================================================================

export interface Applet {
  id: string;
  content: string;
  title?: string;
  icon?: string;
  name?: string;
  windowWidth?: number;
  windowHeight?: number;
  createdAt: number;
  createdBy?: string;
  featured?: boolean;
}
