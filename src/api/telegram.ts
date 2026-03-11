import { apiRequest } from "@/api/core";

export interface TelegramLinkedAccount {
  telegramUserId: string;
  telegramUsername: string | null;
  firstName: string | null;
  lastName: string | null;
  linkedAt: number;
}

export interface TelegramLinkSession {
  code: string;
  expiresIn: number;
  botUsername: string | null;
  deepLink: string | null;
}

export interface TelegramLinkCreateResponse extends TelegramLinkSession {
  linkedAccount: TelegramLinkedAccount | null;
}

export interface TelegramLinkStatusResponse {
  linked: boolean;
  account: TelegramLinkedAccount | null;
  pendingLink: TelegramLinkSession | null;
}

export async function createTelegramLink(): Promise<TelegramLinkCreateResponse> {
  return apiRequest<TelegramLinkCreateResponse>({
    path: "/api/telegram/link/create",
    method: "POST",
  });
}

export async function getTelegramLinkStatus(): Promise<TelegramLinkStatusResponse> {
  return apiRequest<TelegramLinkStatusResponse>({
    path: "/api/telegram/link/status",
  });
}

export async function disconnectTelegramLink(): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    path: "/api/telegram/link/disconnect",
    method: "POST",
  });
}
