/**
 * IRC bridge types
 */

export const DEFAULT_IRC_HOST = "irc.pieter.com";
export const DEFAULT_IRC_PORT = 6667;
export const DEFAULT_IRC_TLS = false;
export const DEFAULT_IRC_CHANNEL = "#pieter";

export interface IrcServerConfig {
  host: string;
  port: number;
  tls: boolean;
}

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

export function normalizeIrcChannel(channel: string): string {
  const trimmed = channel.trim();
  if (!trimmed) return "";
  // Ensure it starts with # (support &, +, ! too but default to #)
  if (/^[#&+!]/.test(trimmed)) return trimmed;
  return `#${trimmed.replace(/^#+/, "")}`;
}

export function buildIrcServerKey(host: string, port: number, tls: boolean): string {
  return `${tls ? "ircs" : "irc"}://${host.toLowerCase()}:${port}`;
}
