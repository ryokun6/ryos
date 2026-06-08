/**
 * IRC bridge types
 */

export {
  DEFAULT_IRC_CHANNEL,
  DEFAULT_IRC_HOST,
  DEFAULT_IRC_PORT,
  DEFAULT_IRC_TLS,
  buildIrcServerKey,
  normalizeIrcChannel,
} from "../../../src/shared/contracts/irc.js";
export type { IrcServerConfig } from "../../../src/shared/contracts/irc.js";

export interface IrcRoomBinding {
  roomId: string;
  channel: string; // e.g. "#pieter"
  host: string;
  port: number;
  tls: boolean;
}

export interface IrcIncomingMessage {
  roomId: string;
  nick: string;
  content: string;
  timestamp: number;
}
