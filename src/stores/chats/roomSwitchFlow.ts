import { readErrorResponseBody } from "./httpErrors";
import { switchPresenceRoomRequest } from "./presenceRequests";

interface SyncPresenceOnRoomSwitchParams {
  previousRoomId: string | null;
  nextRoomId: string | null;
  username: string;
  onRoomsRefresh: () => void;
}

export const syncPresenceOnRoomSwitch = async ({
  previousRoomId,
  nextRoomId,
  username,
  onRoomsRefresh,
}: SyncPresenceOnRoomSwitchParams): Promise<void> => {
  try {
    const response = await switchPresenceRoomRequest({
      previousRoomId,
      nextRoomId,
      username,
    });

    if (!response.ok) {
      const errorData = await readErrorResponseBody(response);
      console.error("[ChatsStore] Error switching rooms:", errorData);
      return;
    }

    console.log("[ChatsStore] Room switch API call successful");
    // Immediately refresh rooms to show updated presence counts
    // This ensures the UI reflects the change immediately rather than waiting for Pusher
    setTimeout(() => {
      console.log("[ChatsStore] Refreshing rooms after switch");
      onRoomsRefresh();
    }, 50); // Small delay to let the server finish processing
  } catch (error) {
    console.error("[ChatsStore] Network error switching rooms:", error);
  }
};
