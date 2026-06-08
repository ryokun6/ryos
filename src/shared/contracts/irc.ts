export const DEFAULT_IRC_HOST = "irc.pieter.com";
export const DEFAULT_IRC_PORT = 6667;
export const DEFAULT_IRC_TLS = false;
export const DEFAULT_IRC_CHANNEL = "#pieter";

export interface IrcServerConfig {
  host: string;
  port: number;
  tls: boolean;
}

export interface IrcServer {
  id: string;
  label: string;
  host: string;
  port: number;
  tls: boolean;
  isDefault?: boolean;
  createdAt: number;
}

export interface CreateIrcServerInput {
  label?: string;
  host: string;
  port: number;
  tls: boolean;
}

export interface IrcChannelEntry {
  channel: string;
  numUsers: number;
  topic: string;
}

export interface IrcServersListResponse {
  servers: IrcServer[];
}

export interface IrcServerCreateResponse {
  server: IrcServer;
}

export interface IrcChannelsListResponse {
  server: IrcServer;
  channels: IrcChannelEntry[];
  truncated: boolean;
}

export function normalizeIrcChannel(channel: string): string {
  const trimmed = channel.trim();
  if (!trimmed) return "";
  if (/^[#&+!]/.test(trimmed)) return trimmed;
  return `#${trimmed.replace(/^#+/, "")}`;
}

export function buildIrcServerKey(
  host: string,
  port: number,
  tls: boolean
): string {
  return `${tls ? "ircs" : "irc"}://${host.toLowerCase()}:${port}`;
}
