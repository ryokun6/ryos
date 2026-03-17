import { create } from "zustand";
import {
  discoverAirDropUsers,
  respondToAirDropTransfer as respondToAirDropTransferApi,
  sendAirDropFile,
  sendAirDropHeartbeat,
} from "@/api/airdrop";
import {
  subscribePusherChannel,
  unsubscribePusherChannel,
} from "@/lib/pusherClient";
import type { PusherChannel } from "@/lib/pusherClient";
import { toast } from "sonner";

const AIRDROP_PRESENCE_TTL_MS = 60_000;
const AIRDROP_LOBBY_CHANNEL = "airdrop-lobby";

export interface AirDropTransfer {
  transferId: string;
  sender: string;
  fileName: string;
  fileType: string;
}

interface AirDropState {
  nearbyUsers: string[];
  isDiscovering: boolean;
  isSending: boolean;
  pendingTransfers: AirDropTransfer[];

  heartbeatInterval: ReturnType<typeof setInterval> | null;
  discoverInterval: ReturnType<typeof setInterval> | null;
  pusherChannel: PusherChannel | null;
  lobbyChannel: PusherChannel | null;
  subscribedUsername: string | null;
  presenceMap: Record<string, number>;

  startAirDrop: (username: string) => void;
  stopAirDrop: () => void;
  fetchNearbyUsers: () => Promise<void>;
  sendFile: (
    recipient: string,
    fileName: string,
    content: string,
    fileType?: string
  ) => Promise<boolean>;
  respondToTransfer: (
    transferId: string,
    accept: boolean
  ) => Promise<{
    success: boolean;
    fileName?: string;
    fileType?: string;
    content?: string;
    sender?: string;
  }>;
  removeTransfer: (transferId: string) => void;
  subscribeToChannel: (username: string) => void;
  unsubscribeFromChannel: () => void;
}

export const useAirDropStore = create<AirDropState>((set, get) => ({
  nearbyUsers: [],
  isDiscovering: false,
  isSending: false,
  pendingTransfers: [],
  heartbeatInterval: null,
  discoverInterval: null,
  pusherChannel: null,
  lobbyChannel: null,
  subscribedUsername: null,
  presenceMap: {},

  startAirDrop: (username: string) => {
    const state = get();
    if (state.heartbeatInterval) return;

    const heartbeat = async () => {
      try {
        await sendAirDropHeartbeat();
      } catch {
        // Silently fail heartbeat
      }
    };

    heartbeat();

    const hbInterval = setInterval(heartbeat, 30000);

    // Prune stale presence entries periodically and derive nearbyUsers
    const pruneInterval = setInterval(() => {
      const now = Date.now();
      const map = { ...get().presenceMap };
      let changed = false;
      for (const [u, ts] of Object.entries(map)) {
        if (now - ts > AIRDROP_PRESENCE_TTL_MS) {
          delete map[u];
          changed = true;
        }
      }
      if (changed) {
        const nearby = Object.keys(map).filter((u) => u !== username);
        set({ presenceMap: map, nearbyUsers: nearby });
      }
    }, 15000);

    set({ heartbeatInterval: hbInterval, discoverInterval: pruneInterval });

    // Subscribe to the lobby channel for push-based discovery
    if (!state.lobbyChannel) {
      const lobby = subscribePusherChannel(AIRDROP_LOBBY_CHANNEL);
      lobby.bind("airdrop-presence", (data: unknown) => {
        const payload = data as { username?: string; timestamp?: number };
        if (!payload?.username || payload.username === username) return;

        const map = { ...get().presenceMap, [payload.username]: payload.timestamp || Date.now() };
        const nearby = Object.keys(map).filter((u) => u !== username);
        set({ presenceMap: map, nearbyUsers: nearby });
      });
      set({ lobbyChannel: lobby });
    }

    // Do one initial fetch to seed the list
    get().fetchNearbyUsers();
    get().subscribeToChannel(username);
  },

  stopAirDrop: () => {
    const state = get();
    if (state.heartbeatInterval) clearInterval(state.heartbeatInterval);
    if (state.discoverInterval) clearInterval(state.discoverInterval);
    if (state.lobbyChannel) {
      state.lobbyChannel.unbind("airdrop-presence");
      unsubscribePusherChannel(AIRDROP_LOBBY_CHANNEL);
    }
    set({
      heartbeatInterval: null,
      discoverInterval: null,
      lobbyChannel: null,
      nearbyUsers: [],
      presenceMap: {},
      isDiscovering: false,
    });
  },

  fetchNearbyUsers: async () => {
    try {
      set({ isDiscovering: true });
      const data = await discoverAirDropUsers();
      const users: string[] = data.users || [];
      const now = Date.now();
      const map: Record<string, number> = {};
      for (const u of users) {
        map[u] = now;
      }
      set({ nearbyUsers: users, presenceMap: map });
    } catch {
      // Silently fail
    } finally {
      set({ isDiscovering: false });
    }
  },

  sendFile: async (recipient, fileName, content, fileType) => {
    set({ isSending: true });
    try {
      await sendAirDropFile({ recipient, fileName, fileType, content });
      toast.success(`Sent "${fileName}" to @${recipient}`);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send file");
      return false;
    } finally {
      set({ isSending: false });
    }
  },

  respondToTransfer: async (transferId, accept) => {
    try {
      const data = await respondToAirDropTransferApi({ transferId, accept });
      get().removeTransfer(transferId);
      return data;
    } catch {
      return { success: false };
    }
  },

  removeTransfer: (transferId) => {
    set((s) => ({
      pendingTransfers: s.pendingTransfers.filter(
        (t) => t.transferId !== transferId
      ),
    }));
  },

  subscribeToChannel: (username: string) => {
    const state = get();
    if (state.subscribedUsername === username && state.pusherChannel) return;

    if (state.pusherChannel && state.subscribedUsername) {
      unsubscribePusherChannel(`airdrop-${state.subscribedUsername}`);
    }

    const channelName = `airdrop-${username}`;
    const channel = subscribePusherChannel(channelName);

    channel.bind("airdrop-request", (data: unknown) => {
      const transfer = data as AirDropTransfer;
      set((s) => ({
        pendingTransfers: [...s.pendingTransfers, transfer],
      }));
    });

    channel.bind("airdrop-accepted", (data: unknown) => {
      const { fileName, recipient } = data as {
        fileName: string;
        recipient: string;
      };
      toast.success(`@${recipient} accepted "${fileName}"`);
    });

    channel.bind("airdrop-declined", (data: unknown) => {
      const { fileName, recipient } = data as {
        fileName: string;
        recipient: string;
      };
      toast.error(`@${recipient} declined "${fileName}"`);
    });

    set({ pusherChannel: channel, subscribedUsername: username });
  },

  unsubscribeFromChannel: () => {
    const state = get();
    if (state.subscribedUsername) {
      const channel = state.pusherChannel;
      if (channel) {
        channel.unbind("airdrop-request");
        channel.unbind("airdrop-accepted");
        channel.unbind("airdrop-declined");
      }
      unsubscribePusherChannel(`airdrop-${state.subscribedUsername}`);
    }
    set({ pusherChannel: null, subscribedUsername: null });
  },
}));
