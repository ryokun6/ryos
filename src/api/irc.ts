import { apiRequest } from "@/api/core";

export interface IrcServerSummary {
  id: string;
  label: string;
  host: string;
  port: number;
  tls: boolean;
  isDefault?: boolean;
  createdAt: number;
}

export interface IrcChannelEntry {
  channel: string;
  numUsers: number;
  topic: string;
}

export interface CreateIrcServerPayload {
  label?: string;
  host: string;
  port: number;
  tls: boolean;
}

export async function listIrcServers(): Promise<{ servers: IrcServerSummary[] }> {
  return apiRequest<{ servers: IrcServerSummary[] }>({
    path: "/api/irc/servers",
    method: "GET",
  });
}

export async function createIrcServer(
  payload: CreateIrcServerPayload
): Promise<{ server: IrcServerSummary }> {
  return apiRequest<{ server: IrcServerSummary }, CreateIrcServerPayload>({
    path: "/api/irc/servers",
    method: "POST",
    body: payload,
  });
}

export async function deleteIrcServer(id: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    path: `/api/irc/servers/${encodeURIComponent(id)}`,
    method: "DELETE",
  });
}

export async function listIrcChannels(
  serverId: string,
  options: { limit?: number; timeoutMs?: number } = {}
): Promise<{
  server: IrcServerSummary;
  channels: IrcChannelEntry[];
  truncated: boolean;
}> {
  return apiRequest<{
    server: IrcServerSummary;
    channels: IrcChannelEntry[];
    truncated: boolean;
  }>({
    path: `/api/irc/servers/${encodeURIComponent(serverId)}/channels`,
    method: "GET",
    query: {
      limit: options.limit ?? undefined,
      timeoutMs: options.timeoutMs ?? undefined,
    },
    timeout: 35000,
  });
}
