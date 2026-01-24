export interface IrcServer {
  id: string;
  host: string;
  port: number;
  nickname: string;
  connected: boolean;
  channels: string[];
}

export interface IrcChannel {
  name: string;
  serverId: string;
  topic?: string;
  users: string[];
}

export interface IrcMessage {
  id: string;
  serverId: string;
  channel: string;
  nickname: string;
  content: string;
  timestamp: number;
  type: 'message' | 'join' | 'part' | 'notice' | 'action' | 'topic' | 'nick';
}
