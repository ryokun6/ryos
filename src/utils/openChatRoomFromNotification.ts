import { useAppStore } from "@/stores/useAppStore";
import { useChatsStore } from "@/stores/useChatsStore";

/**
 * Open/focus Chats and switch to the target room.
 * Used by chat notification "Open" actions.
 */
export const openChatRoomFromNotification = (
  roomId: string | null = null
): void => {
  const appStore = useAppStore.getState();
  appStore.launchApp("chats");

  const chatsStore = useChatsStore.getState();
  const targetRoomId =
    typeof roomId === "string" && roomId.trim().length > 0 ? roomId : null;

  void chatsStore.switchRoom(targetRoomId);
  // Refresh visible rooms so sidebar/channel metadata catches up quickly.
  void chatsStore.fetchRooms();
};
