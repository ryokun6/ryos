import { apiRequest } from "@/api/core";
import type {
  CreateIrcServerInput,
  IrcChannelsListResponse,
  IrcServerCreateResponse,
  IrcServersListResponse,
} from "@/shared/contracts/irc";

export type {
  CreateIrcServerInput as CreateIrcServerPayload,
  IrcChannelEntry,
  IrcServer as IrcServerSummary,
} from "@/shared/contracts/irc";

export async function listIrcServers(): Promise<IrcServersListResponse> {
  return apiRequest<IrcServersListResponse>({
    path: "/api/irc/servers",
    method: "GET",
  });
}

export async function createIrcServer(
  payload: CreateIrcServerInput
): Promise<IrcServerCreateResponse> {
  return apiRequest<IrcServerCreateResponse, CreateIrcServerInput>({
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
): Promise<IrcChannelsListResponse> {
  return apiRequest<IrcChannelsListResponse>({
    path: `/api/irc/servers/${encodeURIComponent(serverId)}/channels`,
    method: "GET",
    query: {
      limit: options.limit ?? undefined,
      timeoutMs: options.timeoutMs ?? undefined,
    },
    timeout: 35000,
  });
}
