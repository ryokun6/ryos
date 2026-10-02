import { useAppStore } from "@/stores/useAppStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { pushLog } from "@/utils/pushNotificationLog";

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

  // If this room is not currently visible in state, refresh rooms to surface it.
  const roomKnown =
    !targetRoomId || chatsStore.rooms.some((room) => room.id === targetRoomId);
  pushLog.debug("Opening chat room from notification", {
    roomId: targetRoomId,
    roomKnown,
    signedIn: chatsStore.isAuthenticated,
  });
  if (!roomKnown) {
    void chatsStore.fetchRooms();
  }
};
