import type { StoreApi } from "zustand";
import type { ChatRoom, ChatMessage, AIChatMessage } from "@/types/chat";

export interface ApiMessage {
  id: string;
  roomId: string;
  username: string;
  content: string;
  timestamp: string | number;
}

export interface CreateRoomPayload {
  type: "public" | "private";
  name?: string;
  members?: string[];
}

export interface ChatsStoreDataState {
  // AI Chat State
  aiMessages: AIChatMessage[];
  // Room State
  username: string | null;
  authToken: string | null;
  hasPassword: boolean | null;
  rooms: ChatRoom[];
  currentRoomId: string | null;
  roomMessages: Record<string, ChatMessage[]>;
  unreadCounts: Record<string, number>;
  hasEverUsedChats: boolean;
  // UI State
  isSidebarVisible: boolean;
  isChannelsOpen: boolean;
  isPrivateOpen: boolean;
  fontSize: number;
  // Rendering limits
  messageRenderLimit: number;
}

export interface ChatsStoreActions {
  setAiMessages: (messages: AIChatMessage[]) => void;
  setUsername: (username: string | null) => void;
  setAuthToken: (token: string | null) => void;
  setHasPassword: (hasPassword: boolean | null) => void;
  checkHasPassword: () => Promise<{ ok: boolean; error?: string }>;
  setPassword: (password: string) => Promise<{ ok: boolean; error?: string }>;
  setRooms: (rooms: ChatRoom[]) => void;
  setCurrentRoomId: (roomId: string | null) => void;
  setRoomMessagesForCurrentRoom: (messages: ChatMessage[]) => void;
  addMessageToRoom: (roomId: string, message: ChatMessage) => void;
  removeMessageFromRoom: (roomId: string, messageId: string) => void;
  clearRoomMessages: (roomId: string) => void;
  toggleSidebarVisibility: () => void;
  toggleChannelsOpen: () => void;
  togglePrivateOpen: () => void;
  setFontSize: (size: number | ((prevSize: number) => number)) => void;
  setMessageRenderLimit: (limit: number) => void;
  ensureAuthToken: () => Promise<{ ok: boolean; error?: string }>;
  refreshAuthToken: () => Promise<{ ok: boolean; error?: string; token?: string }>;
  checkAndRefreshTokenIfNeeded: () => Promise<{ refreshed: boolean }>;

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
    type?: "public" | "private",
    members?: string[]
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

  reset: () => void;
  logout: () => Promise<void>;
}

export interface ChatsStoreState extends ChatsStoreDataState, ChatsStoreActions {}

export type ChatsStoreInitialState = ChatsStoreDataState;

export type ChatsStoreSet = StoreApi<ChatsStoreState>["setState"];
export type ChatsStoreGet = StoreApi<ChatsStoreState>["getState"];
