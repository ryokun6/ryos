import { useBackgroundChatNotifications } from "./useBackgroundChatNotifications";

/** Mounted only for authenticated users after idle. */
export function BackgroundChatNotificationsRunner() {
  useBackgroundChatNotifications();
  return null;
}
