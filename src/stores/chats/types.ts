import type {
  ChatRoom,
  ChatMessage,
  AIChatMessage,
} from "@/types/chat";

// Define the state structure
export interface ChatsStoreState {
  // AI Chat State
  aiMessages: AIChatMessage[];
  // Room State
  username: string | null;
  isAuthenticated: boolean;
  hasPassword: boolean | null; // Whether user has password set (null = unknown/not checked)
  rooms: ChatRoom[];
  currentRoomId: string | null; // ID of the currently selected room, null for AI chat (@ryo)
  roomMessages: Record<string, ChatMessage[]>; // roomId -> messages map
  unreadCounts: Record<string, number>; // roomId -> unread message count
  hasEverUsedChats: boolean; // Track if user has ever used chat before
  // UI State
  isSidebarVisible: boolean;
  isChannelsOpen: boolean; // Persisted collapse state for Channels section
  isPrivateOpen: boolean; // Persisted collapse state for Private section
  fontSize: number; // Add font size state
  // Rendering limits
  messageRenderLimit: number; // Max messages to render per room initially

  // Actions
  setAiMessages: (messages: AIChatMessage[]) => void;
  setUsername: (username: string | null) => void;
  setAuthenticated: (authenticated: boolean) => void;
  setHasPassword: (hasPassword: boolean | null) => void; // Set password status
  checkHasPassword: () => Promise<{ ok: boolean; error?: string }>; // Check if user has password
  setPassword: (
    password: string,
    currentPassword?: string
  ) => Promise<{ ok: boolean; error?: string }>; // Set or change password for user
  setRooms: (rooms: ChatRoom[]) => void;
  setCurrentRoomId: (roomId: string | null) => void;
  setRoomMessagesForCurrentRoom: (messages: ChatMessage[]) => void; // Sets messages for the *current* room
  addMessageToRoom: (roomId: string, message: ChatMessage) => void;
  removeMessageFromRoom: (roomId: string, messageId: string) => void;
  clearRoomMessages: (roomId: string) => void; // Clears messages for a specific room
  toggleSidebarVisibility: () => void;
  toggleChannelsOpen: () => void; // Toggle Channels collapsed state
  togglePrivateOpen: () => void; // Toggle Private collapsed state
  setFontSize: (size: number | ((prevSize: number) => number)) => void; // Add font size action
  setMessageRenderLimit: (limit: number) => void; // Set render limit
  // Room Management Actions
  fetchRooms: () => Promise<{ ok: boolean; error?: string }>;
  fetchMessagesForRoom: (
    roomId: string
  ) => Promise<{ ok: boolean; error?: string }>;
  fetchBulkMessages: (roomIds: string[]) => Promise<{
    ok: boolean;
    error?: string;
    messagesMap?: Record<string, ChatMessage[]>;
  }>;
  switchRoom: (
    roomId: string | null
  ) => Promise<{ ok: boolean; error?: string }>;
  createRoom: (
    name: string,
    type?: "public" | "private" | "irc",
    members?: string[],
    ircOptions?: {
      ircServerId?: string;
      ircHost?: string;
      ircPort?: number;
      ircTls?: boolean;
      ircChannel?: string;
      ircServerLabel?: string;
    }
  ) => Promise<{ ok: boolean; error?: string; roomId?: string }>;
  deleteRoom: (roomId: string) => Promise<{ ok: boolean; error?: string }>;
  sendMessage: (
    roomId: string,
    content: string
  ) => Promise<{ ok: boolean; error?: string }>;
  createUser: (
    username: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string }>;

  incrementUnread: (roomId: string) => void;
  clearUnread: (roomId: string) => void;
  setHasEverUsedChats: (value: boolean) => void;

  reset: () => void; // Reset store to initial state
  logout: () => Promise<void>; // Logout and clear all user data
}

/** Serializable slice of store used as `getInitialState()` return value (no action keys). */
export type ChatsStoreDataSnapshot = Pick<
  ChatsStoreState,
  | "aiMessages"
  | "username"
  | "isAuthenticated"
  | "hasPassword"
  | "rooms"
  | "currentRoomId"
  | "roomMessages"
  | "unreadCounts"
  | "hasEverUsedChats"
  | "isSidebarVisible"
  | "isChannelsOpen"
  | "isPrivateOpen"
  | "fontSize"
  | "messageRenderLimit"
>;
