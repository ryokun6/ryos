interface RoomNotificationParams {
  chatsOpen: boolean;
  currentRoomId: string | null | undefined;
  messageRoomId: string | null | undefined;
}

/**
 * Returns whether a room message should surface unread/toast notifications.
 *
 * Rules:
 * - If Chats app is closed, room messages should still notify.
 * - If Chats app is open, suppress notifications only for the actively viewed room.
 * - Room ids are normalized with trim() to tolerate malformed whitespace payloads.
 */
export const shouldNotifyForRoomMessage = ({
  chatsOpen,
  currentRoomId,
  messageRoomId,
}: RoomNotificationParams): boolean => {
  const normalizedMessageRoomId = messageRoomId?.trim();
  if (!normalizedMessageRoomId) {
    return false;
  }

  if (!chatsOpen) {
    return true;
  }

  const normalizedCurrentRoomId = currentRoomId?.trim() || null;
  return normalizedCurrentRoomId !== normalizedMessageRoomId;
};
