import { apiRequest } from "@/api/core";

export interface SharedAppletListItem {
  id: string;
  title?: string;
  name?: string;
  icon?: string;
  createdAt?: number;
  featured?: boolean;
  createdBy?: string;
}

export interface SharedAppletDetail extends SharedAppletListItem {
  content?: string;
  windowWidth?: number;
  windowHeight?: number;
}

export interface SaveSharedAppletPayload {
  content: string;
  title?: string;
  icon?: string;
  name?: string;
  windowWidth?: number;
  windowHeight?: number;
  shareId?: string;
}

export interface SaveSharedAppletResponse {
  id: string;
  shareUrl: string;
  updated?: boolean;
  createdAt?: number;
}

export async function listSharedApplets(options?: {
  signal?: AbortSignal;
}): Promise<{ applets: SharedAppletListItem[] }> {
  return apiRequest<{ applets: SharedAppletListItem[] }>({
    path: "/api/share-applet",
    method: "GET",
    query: { list: true },
    signal: options?.signal,
    timeout: 15000,
    retry: { maxAttempts: 2, initialDelayMs: 500 },
  });
}

export async function getSharedApplet(
  id: string,
  options?: { signal?: AbortSignal }
): Promise<SharedAppletDetail> {
  return apiRequest<SharedAppletDetail>({
    path: "/api/share-applet",
    method: "GET",
    query: { id },
    signal: options?.signal,
    timeout: 15000,
    retry: { maxAttempts: 2, initialDelayMs: 500 },
  });
}

export async function saveSharedApplet(
  payload: SaveSharedAppletPayload
): Promise<SaveSharedAppletResponse> {
  return apiRequest<SaveSharedAppletResponse, SaveSharedAppletPayload>({
    path: "/api/share-applet",
    method: "POST",
    body: payload,
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}

export async function deleteSharedApplet(id: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    path: "/api/share-applet",
    method: "DELETE",
    query: { id },
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}

export async function updateSharedApplet(
  id: string,
  payload: { featured: boolean }
): Promise<{ success: boolean; featured: boolean }> {
  return apiRequest<{ success: boolean; featured: boolean }, { featured: boolean }>({
    path: "/api/share-applet",
    method: "PATCH",
    query: { id },
    body: payload,
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}
