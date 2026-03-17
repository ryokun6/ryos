import { apiRequest } from "@/api/core";

export interface CandybarIconPackIcon {
  name: string;
  url: string;
}

export interface CandybarIconPack {
  id: string;
  name: string;
  author: string;
  description: string;
  previewIcons: CandybarIconPackIcon[];
  iconCount: number;
  downloadUrl?: string;
  createdAt: string;
  category: string;
}

export async function listCandybarPacks(): Promise<{
  packs: CandybarIconPack[];
}> {
  return apiRequest<{ packs: CandybarIconPack[] }>({
    path: "/api/candybar/packs",
    method: "GET",
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}
