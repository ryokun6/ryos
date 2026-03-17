import { useCallback, useEffect, useRef, useState } from "react";
import {
  subscribePusherChannel,
  unsubscribePusherChannel,
} from "@/lib/pusherClient";
import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";
import { useChatsStore } from "@/stores/useChatsStore";

const GLOBAL_PRESENCE_CHANNEL = "presence-global";
const HEARTBEAT_INTERVAL_MS = 60_000;
const PRESENCE_TTL_MS = 90_000;
const PRUNE_INTERVAL_MS = 30_000;

interface PresenceEntry {
  timestamp: number;
}

/**
 * Tracks which users are online globally. Logged-in users send a heartbeat
 * every 60s (only while `heartbeatActive`) and receive push updates on the
 * shared channel.
 *
 * @param heartbeatActive - When false, no API calls (e.g. Chats window closed).
 * @returns The set of online usernames (excluding self).
 */
export function useGlobalPresence(heartbeatActive: boolean): string[] {
  const username = useChatsStore((s) => s.username);
  const isAuthenticated = useChatsStore((s) => s.isAuthenticated);

  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const presenceMapRef = useRef<Record<string, PresenceEntry>>({});

  const deriveOnlineList = useCallback(() => {
    const now = Date.now();
    const map = presenceMapRef.current;
    const result: string[] = [];
    for (const [user, entry] of Object.entries(map)) {
      if (now - entry.timestamp > PRESENCE_TTL_MS) {
        delete map[user];
      } else if (user !== username) {
        result.push(user);
      }
    }
    setOnlineUsers(result);
  }, [username]);

  useEffect(() => {
    if (!username || !isAuthenticated || !heartbeatActive) return;

    // Send heartbeat
    const sendHeartbeat = () => {
      abortableFetch(getApiUrl("/api/presence/heartbeat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 500 },
      }).catch(() => {});
    };

    // Initial heartbeat + seed
    sendHeartbeat();
    abortableFetch(getApiUrl("/api/presence/heartbeat"), {
      method: "GET",
      timeout: 10000,
      throwOnHttpError: false,
      retry: { maxAttempts: 1, initialDelayMs: 500 },
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          const users: string[] = data.users || [];
          const now = Date.now();
          const map: Record<string, PresenceEntry> = {};
          for (const u of users) {
            map[u] = { timestamp: now };
          }
          presenceMapRef.current = map;
          deriveOnlineList();
        }
      })
      .catch(() => {});

    const heartbeatId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    const pruneId = setInterval(deriveOnlineList, PRUNE_INTERVAL_MS);

    // Subscribe to push updates
    const channel = subscribePusherChannel(GLOBAL_PRESENCE_CHANNEL);
    const handler = (data: unknown) => {
      const payload = data as { username?: string; timestamp?: number };
      if (!payload?.username) return;
      presenceMapRef.current[payload.username] = {
        timestamp: payload.timestamp || Date.now(),
      };
      deriveOnlineList();
    };
    channel.bind("user-heartbeat", handler);

    return () => {
      clearInterval(heartbeatId);
      clearInterval(pruneId);
      channel.unbind("user-heartbeat", handler);
      unsubscribePusherChannel(GLOBAL_PRESENCE_CHANNEL);
    };
  }, [username, isAuthenticated, heartbeatActive, deriveOnlineList]);

  return onlineUsers;
}
