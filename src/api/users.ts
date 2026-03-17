import { apiRequest } from "@/api/core";
import type { User } from "@/types/chat";

export async function searchUsers(
  search: string,
): Promise<{ users: User[] }> {
  return apiRequest<{ users: User[] }>({
    path: "/api/users",
    method: "GET",
    query: { search },
    timeout: 10000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}
