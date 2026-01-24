/**
 * TypeScript types for IRC API
 */

export interface IrcServerConfig {
  id: string;
  host: string;
  port: number;
  nickname: string;
  connected: boolean;
  channels: string[];
  connectedAt?: number;
}

export interface IrcChannelData {
  name: string;
  serverId: string;
  topic?: string;
  users: string[];
}

export interface IrcMessageData {
  id: string;
  serverId: string;
  channel: string;
  nickname: string;
  content: string;
  timestamp: number;
  type: 'message' | 'join' | 'part' | 'notice' | 'action' | 'topic' | 'nick';
}

export interface ConnectIrcRequest {
  host: string;
  port: number;
  nickname: string;
}

export interface DisconnectIrcRequest {
  serverId: string;
}

export interface JoinChannelRequest {
  serverId: string;
  channel: string;
}

export interface PartChannelRequest {
  serverId: string;
  channel: string;
}

export interface SendMessageRequest {
  serverId: string;
  channel: string;
  content: string;
}
