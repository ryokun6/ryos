import Pusher from "pusher";
import {
  createRedisPublisher,
  createRedisSubscriber,
  supportsRedisPubSub,
} from "./redis.js";
import {
  getRealtimeProvider,
  shouldEnableRealtimeDebugLogs,
} from "./runtime-config.js";

export interface RealtimeEventPayload {
  channel: string;
  event: string;
  data: unknown;
}

export interface LocalRealtimeSocket {
  send(payload: string): void;
}

const LOCAL_REALTIME_REDIS_CHANNEL = "ryos:realtime";

const globalRealtimeState = globalThis as typeof globalThis & {
  __ryosRealtimeSockets?: Set<LocalRealtimeSocket>;
  __ryosRealtimeSocketSubscriptions?: Map<LocalRealtimeSocket, Set<string>>;
  __ryosRealtimeChannelSockets?: Map<string, Set<LocalRealtimeSocket>>;
  __ryosRealtimePubSubStarted?: boolean;
  __ryosRealtimeProcessId?: string;
  __ryosPusherServer?: Pusher;
};

function debugLog(message: string, details?: unknown): void {
  if (!shouldEnableRealtimeDebugLogs()) {
    return;
  }
  console.debug(`[realtime] ${message}`, details ?? "");
}

function getSockets(): Set<LocalRealtimeSocket> {
  if (!globalRealtimeState.__ryosRealtimeSockets) {
    globalRealtimeState.__ryosRealtimeSockets = new Set();
  }
  return globalRealtimeState.__ryosRealtimeSockets;
}

function getSocketSubscriptions(): Map<LocalRealtimeSocket, Set<string>> {
  if (!globalRealtimeState.__ryosRealtimeSocketSubscriptions) {
    globalRealtimeState.__ryosRealtimeSocketSubscriptions = new Map();
  }
  return globalRealtimeState.__ryosRealtimeSocketSubscriptions;
}

function getChannelSockets(): Map<string, Set<LocalRealtimeSocket>> {
  if (!globalRealtimeState.__ryosRealtimeChannelSockets) {
    globalRealtimeState.__ryosRealtimeChannelSockets = new Map();
  }
  return globalRealtimeState.__ryosRealtimeChannelSockets;
}

function getRealtimeProcessId(): string {
  if (!globalRealtimeState.__ryosRealtimeProcessId) {
    globalRealtimeState.__ryosRealtimeProcessId = crypto.randomUUID();
  }
  return globalRealtimeState.__ryosRealtimeProcessId;
}

function getPusherServer(): Pusher {
  if (!globalRealtimeState.__ryosPusherServer) {
    globalRealtimeState.__ryosPusherServer = new Pusher({
      appId: process.env.PUSHER_APP_ID!,
      key: process.env.PUSHER_KEY!,
      secret: process.env.PUSHER_SECRET!,
      cluster: process.env.PUSHER_CLUSTER!,
      useTLS: process.env.PUSHER_FORCE_TLS !== "false",
    });
  }
  return globalRealtimeState.__ryosPusherServer;
}

function sendEventToLocalSockets(payload: RealtimeEventPayload): void {
  const sockets = getChannelSockets().get(payload.channel);
  if (!sockets || sockets.size === 0) {
    return;
  }

  const serialized = JSON.stringify({
    type: "event",
    channel: payload.channel,
    event: payload.event,
    data: payload.data,
  });

  for (const socket of sockets) {
    try {
      socket.send(serialized);
    } catch (error) {
      debugLog("Failed to send local realtime event", error);
      unregisterRealtimeSocket(socket);
    }
  }
}

async function publishToRedisPubSub(payload: RealtimeEventPayload): Promise<void> {
  if (!supportsRedisPubSub()) {
    return;
  }

  const publisher = createRedisPublisher();
  await publisher.publish(
    LOCAL_REALTIME_REDIS_CHANNEL,
    JSON.stringify({
      sourceId: getRealtimeProcessId(),
      ...payload,
    })
  );
}

export async function ensureRealtimePubSubBridge(): Promise<void> {
  if (getRealtimeProvider() !== "local" || !supportsRedisPubSub()) {
    return;
  }

  if (globalRealtimeState.__ryosRealtimePubSubStarted) {
    return;
  }

  const subscriber = createRedisSubscriber();
  globalRealtimeState.__ryosRealtimePubSubStarted = true;

  subscriber.on("message", (channel, rawMessage) => {
    if (channel !== LOCAL_REALTIME_REDIS_CHANNEL) {
      return;
    }

    try {
      const payload = JSON.parse(rawMessage) as RealtimeEventPayload & {
        sourceId?: string;
      };

      if (payload.sourceId === getRealtimeProcessId()) {
        return;
      }

      sendEventToLocalSockets({
        channel: payload.channel,
        event: payload.event,
        data: payload.data,
      });
    } catch (error) {
      debugLog("Failed to parse realtime pub/sub message", error);
    }
  });

  await subscriber.subscribe(LOCAL_REALTIME_REDIS_CHANNEL);
  debugLog("Subscribed to realtime Redis pub/sub bridge");
}

export function registerRealtimeSocket(socket: LocalRealtimeSocket): void {
  getSockets().add(socket);
  getSocketSubscriptions().set(socket, new Set());
}

export function unregisterRealtimeSocket(socket: LocalRealtimeSocket): void {
  getSockets().delete(socket);
  const subscriptions = getSocketSubscriptions().get(socket) || new Set();
  const channelSockets = getChannelSockets();

  for (const channel of subscriptions) {
    const sockets = channelSockets.get(channel);
    if (!sockets) continue;
    sockets.delete(socket);
    if (sockets.size === 0) {
      channelSockets.delete(channel);
    }
  }

  getSocketSubscriptions().delete(socket);
}

export function subscribeRealtimeSocket(
  socket: LocalRealtimeSocket,
  channel: string
): void {
  const normalizedChannel = channel.trim();
  if (!normalizedChannel) return;

  const subscriptions = getSocketSubscriptions();
  const socketChannels = subscriptions.get(socket) || new Set<string>();
  socketChannels.add(normalizedChannel);
  subscriptions.set(socket, socketChannels);

  const channelSockets = getChannelSockets();
  const sockets = channelSockets.get(normalizedChannel) || new Set();
  sockets.add(socket);
  channelSockets.set(normalizedChannel, sockets);
}

export function unsubscribeRealtimeSocket(
  socket: LocalRealtimeSocket,
  channel: string
): void {
  const normalizedChannel = channel.trim();
  if (!normalizedChannel) return;

  const subscriptions = getSocketSubscriptions();
  const socketChannels = subscriptions.get(socket);
  socketChannels?.delete(normalizedChannel);

  const channelSockets = getChannelSockets();
  const sockets = channelSockets.get(normalizedChannel);
  sockets?.delete(socket);
  if (sockets && sockets.size === 0) {
    channelSockets.delete(normalizedChannel);
  }
}

export async function triggerRealtimeEvent(
  channel: string,
  event: string,
  data: unknown
): Promise<void> {
  const payload: RealtimeEventPayload = { channel, event, data };

  if (getRealtimeProvider() === "local") {
    sendEventToLocalSockets(payload);
    await publishToRedisPubSub(payload);
    return;
  }

  await getPusherServer().trigger(channel, event, data);
}

export async function triggerRealtimeBatch(
  events: Array<{ channel: string; name: string; data: unknown }>
): Promise<void> {
  if (events.length === 0) return;

  if (getRealtimeProvider() === "local") {
    for (const event of events) {
      await triggerRealtimeEvent(event.channel, event.name, event.data);
    }
    return;
  }

  const BATCH_SIZE = 10;
  const pusher = getPusherServer();
  const batches: Array<typeof events> = [];

  for (let index = 0; index < events.length; index += BATCH_SIZE) {
    batches.push(events.slice(index, index + BATCH_SIZE));
  }

  await Promise.all(batches.map((batch) => pusher.triggerBatch(batch)));
}
