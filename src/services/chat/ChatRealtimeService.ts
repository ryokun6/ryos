import type { PusherChannel } from "@/lib/pusherClient";
import {
  getPusherClient,
  subscribePusherChannel,
  unsubscribePusherChannel,
} from "@/lib/pusherClient";
import type { ChatMessage, ChatRoom } from "@/types/chat";
import {
  getChatRoomChannelName,
  getChatsGlobalChannelName,
} from "@/shared/constants/realtime";
import { normalizeChatTimestamp } from "@/shared/contracts/chat";

export interface GlobalHandlers {
  onRoomCreated: (data: { room: ChatRoom }) => void;
  onRoomDeleted: (data: { roomId: string }) => void;
  onRoomUpdated: (data: { room: ChatRoom }) => void;
  onRoomsUpdated: (data: { rooms: ChatRoom[] }) => void;
}

export interface RoomMessagePayload {
  message: ChatMessage;
}

export interface MessageDeletedPayload {
  roomId: string;
  messageId: string;
}

export interface RoomHandlers {
  onRoomMessage: (data: RoomMessagePayload) => void;
  onMessageDeleted: (data: MessageDeletedPayload) => void;
  onPresenceUpdate?: (data: {
    username: string;
    action: "joined" | "left";
    userCount: number;
  }) => void;
  onUserTyping?: (data: { username: string; isTyping: boolean }) => void;
}

export function normalizeRealtimeChatMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    timestamp: normalizeChatTimestamp(message.timestamp),
  };
}

export class ChatRealtimeService {
  private pusher: ReturnType<typeof getPusherClient> | null = null;
  private globalChannel: PusherChannel | null = null;
  private globalHandlers: GlobalHandlers | null = null;
  private readonly roomChannels: Record<string, PusherChannel> = {};
  private readonly roomHandlers: Record<string, RoomHandlers> = {};

  ensureClient(): void {
    if (!this.pusher) {
      this.pusher = getPusherClient();
    }
  }

  subscribeGlobal(username: string | null | undefined, handlers: GlobalHandlers): string {
    this.ensureClient();
    const channelName = getChatsGlobalChannelName(username);
    if (this.globalChannel && this.globalChannel.name !== channelName) {
      this.unsubscribeGlobal();
    }
    if (this.globalChannel) {
      return this.globalChannel.name;
    }

    const channel = subscribePusherChannel(channelName);
    channel.bind("room-created", handlers.onRoomCreated);
    channel.bind("room-deleted", handlers.onRoomDeleted);
    channel.bind("room-updated", handlers.onRoomUpdated);
    channel.bind("rooms-updated", handlers.onRoomsUpdated);
    this.globalChannel = channel;
    this.globalHandlers = handlers;
    return channel.name;
  }

  unsubscribeGlobal(): void {
    const channel = this.globalChannel;
    const handlers = this.globalHandlers;
    if (channel && handlers) {
      channel.unbind("room-created", handlers.onRoomCreated);
      channel.unbind("room-deleted", handlers.onRoomDeleted);
      channel.unbind("room-updated", handlers.onRoomUpdated);
      channel.unbind("rooms-updated", handlers.onRoomsUpdated);
    }
    if (channel) {
      unsubscribePusherChannel(channel.name);
    }
    this.globalChannel = null;
    this.globalHandlers = null;
  }

  subscribeRoom(roomId: string, handlers: RoomHandlers): string | null {
    if (!roomId || this.roomChannels[roomId]) return this.roomChannels[roomId]?.name ?? null;
    this.ensureClient();
    const channel = subscribePusherChannel(getChatRoomChannelName(roomId));
    channel.bind("room-message", handlers.onRoomMessage);
    channel.bind("message-deleted", handlers.onMessageDeleted);
    if (handlers.onPresenceUpdate) {
      channel.bind("presence-update", handlers.onPresenceUpdate);
    }
    if (handlers.onUserTyping) {
      channel.bind("user-typing", handlers.onUserTyping);
    }
    this.roomChannels[roomId] = channel;
    this.roomHandlers[roomId] = handlers;
    return channel.name;
  }

  unsubscribeRoom(roomId: string): void {
    const channel = this.roomChannels[roomId];
    const handlers = this.roomHandlers[roomId];
    if (!channel) return;
    if (handlers) {
      channel.unbind("room-message", handlers.onRoomMessage);
      channel.unbind("message-deleted", handlers.onMessageDeleted);
      if (handlers.onPresenceUpdate) {
        channel.unbind("presence-update", handlers.onPresenceUpdate);
      }
      if (handlers.onUserTyping) {
        channel.unbind("user-typing", handlers.onUserTyping);
      }
    }
    unsubscribePusherChannel(channel.name);
    delete this.roomChannels[roomId];
    delete this.roomHandlers[roomId];
  }

  unsubscribeAllRooms(): void {
    Object.keys(this.roomChannels).forEach((roomId) => {
      this.unsubscribeRoom(roomId);
    });
  }

  getSubscribedRoomIds(): string[] {
    return Object.keys(this.roomChannels);
  }

  unsubscribeAll(): void {
    this.unsubscribeGlobal();
    this.unsubscribeAllRooms();
  }
}
