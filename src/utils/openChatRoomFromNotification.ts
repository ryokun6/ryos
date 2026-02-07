import { useAppStore } from "@/stores/useAppStore";
import { useChatsStore } from "@/stores/useChatsStore";

/**
 * Open/focus Chats and switch to the target room.
 * Used by chat notification "Open" actions.
 */
export const openChatRoomFromNotification = (roomId: string): void => {
  const appStore = useAppStore.getState();
  appStore.launchApp("chats");

  if (!roomId) {
    return;
  }

  void useChatsStore.getState().switchRoom(roomId);
};
