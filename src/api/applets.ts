import { apiRequest } from "@/api/core";

export interface SharedAppletSummary {
  id: string;
  title?: string;
  name?: string;
  icon?: string;
  createdAt?: number;
  createdBy?: string;
  featured?: boolean;
}

export interface ShareAppletPayload {
  content: string;
  title?: string;
  icon?: string;
  name?: string;
  windowWidth?: number;
  windowHeight?: number;
  shareId?: string;
}

export interface ShareAppletResponse {
  id: string;
  shareUrl?: string;
  updated?: boolean;
  createdAt?: number;
}

export interface SharedAppletDetail extends SharedAppletSummary {
  content?: string;
  windowWidth?: number;
  windowHeight?: number;
}

export async function listSharedApplets(options: {
  signal?: AbortSignal;
} = {}): Promise<{ applets: SharedAppletSummary[] }> {
  return apiRequest<{ applets: SharedAppletSummary[] }>({
    path: "/api/share-applet",
    method: "GET",
    query: { list: true },
    signal: options.signal,
    timeout: 15000,
    retry: { maxAttempts: 2, initialDelayMs: 500 },
  });
}

export async function shareApplet(
  payload: ShareAppletPayload
): Promise<ShareAppletResponse> {
  return apiRequest<ShareAppletResponse, ShareAppletPayload>({
    path: "/api/share-applet",
    method: "POST",
    body: payload,
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}

export async function getSharedApplet(
  shareId: string,
  options: { signal?: AbortSignal } = {}
): Promise<SharedAppletDetail> {
  return apiRequest<SharedAppletDetail>({
    path: "/api/share-applet",
    method: "GET",
    query: { id: shareId },
    signal: options.signal,
    timeout: 15000,
    retry: { maxAttempts: 2, initialDelayMs: 500 },
  });
}

export async function deleteSharedApplet(shareId: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    path: "/api/share-applet",
    method: "DELETE",
    query: { id: shareId },
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}

export async function updateSharedAppletFeatured(
  shareId: string,
  featured: boolean
): Promise<{ success: boolean; featured: boolean }> {
  return apiRequest<{ success: boolean; featured: boolean }, { featured: boolean }>({
    path: "/api/share-applet",
    method: "PATCH",
    query: { id: shareId },
    body: { featured },
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}
