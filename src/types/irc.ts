export type IrcMessageType =
  | "message"
  | "join"
  | "part"
  | "notice"
  | "action"
  | "topic"
  | "nick"
  | "system";

export interface IrcMessage {
  id: string;
  channel: string;
  nick: string;
  content: string;
  timestamp: number;
  type: IrcMessageType;
}

export interface IrcChannel {
  name: string;
  topic?: string;
  users: string[];
  userCount: number;
}

export interface IrcUser {
  nick: string;
  modes?: string[];
}

export interface IrcConnectionState {
  connected: boolean;
  nick: string | null;
  channels: string[];
  serverInfo?: {
    name: string;
    version?: string;
  };
}

export interface IrcConnectRequest {
  nick: string;
  channels?: string[];
}

export interface IrcConnectResponse {
  sessionId: string;
  nick: string;
  channels: string[];
}

export interface IrcSendRequest {
  sessionId: string;
  channel: string;
  content: string;
}

export interface IrcJoinRequest {
  sessionId: string;
  channel: string;
}

export interface IrcPartRequest {
  sessionId: string;
  channel: string;
}

export interface IrcChannelsResponse {
  channels: IrcChannel[];
}

export interface IrcStreamEvent {
  type: "message" | "system" | "state";
  payload: IrcMessage | { state: IrcConnectionState } | { text: string };
}
