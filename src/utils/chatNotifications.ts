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
 */
export const shouldNotifyForRoomMessage = ({
  chatsOpen,
  currentRoomId,
  messageRoomId,
}: RoomNotificationParams): boolean => {
  if (!messageRoomId) {
    return false;
  }

  if (!chatsOpen) {
    return true;
  }

  return currentRoomId !== messageRoomId;
};
