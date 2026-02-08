import { useAppStore } from "@/stores/useAppStore";
import { useChatsStore } from "@/stores/useChatsStore";

/**
 * Open/focus Chats and switch to the target room.
 * Used by chat notification "Open" actions.
 */
export const openChatRoomFromNotification = (roomId: string): void => {
  const appStore = useAppStore.getState();
  appStore.launchApp("chats");

  const chatsStore = useChatsStore.getState();

  if (!roomId) {
    void chatsStore.fetchRooms();
    return;
  }

  void chatsStore.switchRoom(roomId);
  // Refresh visible rooms so sidebar/channel metadata catches up quickly.
  void chatsStore.fetchRooms();
};
