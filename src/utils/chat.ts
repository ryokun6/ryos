/**
 * Format a private room name by excluding the current user
 * @param roomName - The room name (e.g., "@user1, @user2, @user3")
 * @param currentUsername - The current user's username to exclude
 * @returns The formatted room name without the current user
 */
export function formatPrivateRoomName(
  roomName: string,
  currentUsername: string | null
): string {
  if (!currentUsername) return roomName;

  // Parse the room name to extract usernames
  const users = roomName
    .split(", ")
    .map((u) => u.trim())
    .filter((u) => u.startsWith("@"))
    .map((u) => u.substring(1)); // Remove @ prefix

  // Filter out the current user (case-sensitive) so that variations like "Zi" (AI) remain visible
  const otherUsers = users.filter((u) => u !== currentUsername);

  // If no other users (shouldn't happen in a valid private room), return original
  if (otherUsers.length === 0) return roomName;

  // Return formatted name with @ prefixes
  return otherUsers.map((u) => `@${u}`).join(", ");
}

/**
 * Return a display name for a private room using the members array if present.
 * If the members list contains only the current user, we still show their own
 * username so the sidebar/window title isn't empty.
 *
 * This intentionally relies on the `members` list instead of the `name`
 * string (which can become stale when members leave/join).
 */
export function getPrivateRoomDisplayName(
  room: { members?: string[]; name: string },
  currentUsername: string | null
): string {
  // Prefer the members list when available.
  if (Array.isArray(room.members) && room.members.length > 0) {
    const others = room.members.filter(
      (m) => !currentUsername || m !== currentUsername.toLowerCase()
    );

    // Show other members if any; otherwise show yourself
    const display =
      others.length > 0 ? others : [currentUsername ?? room.members[0]];
    // Prefix each with @ and join
    return display.map((u) => `@${u}`).join(", ");
  }

  // Fallback to existing room.name formatting (legacy data)
  return formatPrivateRoomName(room.name, currentUsername);
}
