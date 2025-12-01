import Pusher from "pusher";

let pusherClient = null;

export const getPusherClient = () => {
  if (pusherClient) {
    return pusherClient;
  }

  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } =
    process.env;

  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET || !PUSHER_CLUSTER) {
    throw new Error("Missing required Pusher environment variables");
  }

  pusherClient = new Pusher({
    appId: PUSHER_APP_ID,
    key: PUSHER_KEY,
    secret: PUSHER_SECRET,
    cluster: PUSHER_CLUSTER,
    useTLS: true,
  });

  return pusherClient;
};
