import { handleGetUsers } from "../rooms/_helpers/_users.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface UsersSearchCoreInput {
  originAllowed: boolean;
  searchQuery: string;
}

export async function executeUsersSearchCore(
  input: UsersSearchCoreInput
): Promise<CoreResponse> {
  if (!input.originAllowed) {
    return { status: 403, body: { error: "Unauthorized" } };
  }

  try {
    const response = await handleGetUsers("users-search", input.searchQuery);
    const data = await response.json();
    return { status: response.status, body: data };
  } catch {
    return { status: 500, body: { error: "Failed to search users" } };
  }
}
