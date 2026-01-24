import { useState, useEffect, useCallback, useRef } from "react";
import type { PusherChannel } from "@/lib/pusherClient";
import { getPusherClient } from "@/lib/pusherClient";
import { useChatsStore } from "../../../stores/useChatsStore";
import { toast } from "@/hooks/useToast";
import { type IrcServer, type IrcMessage } from "@/types/irc";

/**
 * Sanitize server ID for use in Pusher channel names
 * Must match the server-side sanitization in api/irc/_helpers/_pusher.ts
 */
function sanitizeForChannel(str: string): string {
  return str.replace(/[^a-zA-Z0-9_\-\.]/g, "_");
}

export function useIrcChat(isWindowOpen: boolean) {
  const {
    username,
    ircServers,
    ircChannels,
    ircMessages,
    currentIrcChannel,
    connectIrcServer,
    disconnectIrcServer,
    joinIrcChannel,
    partIrcChannel,
    sendIrcMessage,
    addIrcMessage,
    setCurrentIrcChannel,
    setIrcServerConnected,
    setIrcServerChannels,
    setIrcChannelInfo,
  } = useChatsStore();

  // Pusher refs
  const pusherRef = useRef<ReturnType<typeof getPusherClient> | null>(null);
  const serverChannelsRef = useRef<Record<string, PusherChannel>>({});
  const channelChannelsRef = useRef<Record<string, PusherChannel>>({});
  const hasInitialized = useRef(false);

  // Initialize Pusher
  const initializePusher = useCallback(() => {
    if (pusherRef.current) return;

    console.log("[IRC Hook] Getting singleton Pusher client...");
    pusherRef.current = getPusherClient();

    pusherRef.current.connection.bind("connected", () => {
      console.log("[IRC Hook] Connected to Pusher");
    });

    pusherRef.current.connection.bind("error", (error: Error) => {
      console.error("[IRC Hook] Connection error:", error);
    });
  }, []);

  // Subscribe to server events
  const subscribeToServerChannel = useCallback((serverId: string) => {
    if (!pusherRef.current) return;

    const safeServerId = sanitizeForChannel(serverId);
    const channelName = `irc-server-${safeServerId}`;
    if (serverChannelsRef.current[serverId]) return; // Already subscribed

    console.log(`[IRC Hook] Subscribing to server channel: ${channelName}`);
    const channel = pusherRef.current.subscribe(channelName);

    channel.bind("irc-connected", (data: { serverId: string }) => {
      console.log("[IRC Hook] IRC server connected:", data.serverId);
      setIrcServerConnected(data.serverId, true);
      toast({
        title: "IRC Connected",
        description: `Connected to ${data.serverId}`,
      });
    });

    channel.bind("irc-disconnected", (data: { serverId: string }) => {
      console.log("[IRC Hook] IRC server disconnected:", data.serverId);
      setIrcServerConnected(data.serverId, false);
      toast({
        title: "IRC Disconnected",
        description: `Disconnected from ${data.serverId}`,
      });
    });

    channel.bind("irc-channels-updated", (data: { serverId: string; channels: string[] }) => {
      console.log("[IRC Hook] IRC channels updated:", data);
      setIrcServerChannels(data.serverId, data.channels);
    });

    serverChannelsRef.current[serverId] = channel;
  }, [setIrcServerConnected, setIrcServerChannels]);

  // Subscribe to channel events
  const subscribeToChannel = useCallback((serverId: string, channel: string) => {
    if (!pusherRef.current) return;

    const channelKey = `${serverId}:${channel}`;
    const safeServerId = sanitizeForChannel(serverId);
    const safeChannel = sanitizeForChannel(channel);
    const channelName = `irc-${safeServerId}-${safeChannel}`;
    
    if (channelChannelsRef.current[channelKey]) return; // Already subscribed

    console.log(`[IRC Hook] Subscribing to IRC channel: ${channelName}`);
    const pusherChannel = pusherRef.current.subscribe(channelName);

    pusherChannel.bind("irc-message", (data: IrcMessage) => {
      console.log("[IRC Hook] IRC message received:", data);
      addIrcMessage(data.serverId, data.channel, data);
    });

    pusherChannel.bind("irc-join", (data: { nickname: string; channel: string }) => {
      console.log("[IRC Hook] User joined:", data);
      // Update channel user list
      const channelData = ircChannels[channelKey];
      if (channelData && !channelData.users.includes(data.nickname)) {
        setIrcChannelInfo(serverId, channel, {
          users: [...channelData.users, data.nickname],
        });
      }
    });

    pusherChannel.bind("irc-part", (data: { nickname: string; channel: string }) => {
      console.log("[IRC Hook] User left:", data);
      // Update channel user list
      const channelData = ircChannels[channelKey];
      if (channelData) {
        setIrcChannelInfo(serverId, channel, {
          users: channelData.users.filter(u => u !== data.nickname),
        });
      }
    });

    pusherChannel.bind("irc-topic", (data: { channel: string; topic: string; setBy: string }) => {
      console.log("[IRC Hook] Topic changed:", data);
      setIrcChannelInfo(serverId, channel, {
        topic: data.topic,
      });
    });

    channelChannelsRef.current[channelKey] = pusherChannel;
  }, [ircChannels, addIrcMessage, setIrcChannelInfo]);

  // Unsubscribe from channel
  const unsubscribeFromChannel = useCallback((serverId: string, channel: string) => {
    const channelKey = `${serverId}:${channel}`;
    const pusherChannel = channelChannelsRef.current[channelKey];
    if (pusherChannel && pusherRef.current) {
      const safeServerId = sanitizeForChannel(serverId);
      const safeChannel = sanitizeForChannel(channel);
      console.log(`[IRC Hook] Unsubscribing from IRC channel: ${channelKey}`);
      pusherRef.current.unsubscribe(`irc-${safeServerId}-${safeChannel}`);
      delete channelChannelsRef.current[channelKey];
    }
  }, []);

  // Unsubscribe from server
  const unsubscribeFromServer = useCallback((serverId: string) => {
    const pusherChannel = serverChannelsRef.current[serverId];
    if (pusherChannel && pusherRef.current) {
      const safeServerId = sanitizeForChannel(serverId);
      console.log(`[IRC Hook] Unsubscribing from server channel: ${serverId}`);
      pusherRef.current.unsubscribe(`irc-server-${safeServerId}`);
      delete serverChannelsRef.current[serverId];
    }
  }, []);

  // Initialize subscriptions when window opens
  useEffect(() => {
    if (!isWindowOpen || hasInitialized.current) return;

    initializePusher();
    hasInitialized.current = true;

    // Subscribe to all existing servers
    ircServers.forEach(server => {
      if (server.connected) {
        subscribeToServerChannel(server.id);
        server.channels.forEach(channel => {
          subscribeToChannel(server.id, channel);
        });
      }
    });

    return () => {
      // Cleanup on unmount (but keep Pusher connection alive)
      Object.keys(channelChannelsRef.current).forEach(key => {
        const [serverId, channel] = key.split(":");
        unsubscribeFromChannel(serverId, channel);
      });
      Object.keys(serverChannelsRef.current).forEach(serverId => {
        unsubscribeFromServer(serverId);
      });
    };
  }, [isWindowOpen, ircServers, initializePusher, subscribeToServerChannel, subscribeToChannel, unsubscribeFromChannel, unsubscribeFromServer]);

  // Auto-connect to default server on mount if username is available
  useEffect(() => {
    if (!username || ircServers.length > 0) return;

    const defaultHost = "irc.pieter.com";
    const defaultPort = 6667;
    const defaultNickname = username;

    // Auto-connect to default server
    connectIrcServer(defaultHost, defaultPort, defaultNickname).then(result => {
      if (result.ok && result.serverId) {
        console.log("[IRC Hook] Auto-connected to default IRC server");
        subscribeToServerChannel(result.serverId);
      }
    });
  }, [username, ircServers.length, connectIrcServer, subscribeToServerChannel]);

  // Handle connecting to a server
  const handleConnect = useCallback(async (host: string, port: number, nickname: string) => {
    const result = await connectIrcServer(host, port, nickname);
    if (result.ok && result.serverId) {
      subscribeToServerChannel(result.serverId);
    }
    return result;
  }, [connectIrcServer, subscribeToServerChannel]);

  // Handle disconnecting from a server
  const handleDisconnect = useCallback(async (serverId: string) => {
    // Unsubscribe from all channels first
    const server = ircServers.find(s => s.id === serverId);
    if (server) {
      server.channels.forEach(channel => {
        unsubscribeFromChannel(serverId, channel);
      });
    }
    unsubscribeFromServer(serverId);
    
    return await disconnectIrcServer(serverId);
  }, [ircServers, disconnectIrcServer, unsubscribeFromChannel, unsubscribeFromServer]);

  // Handle joining a channel
  const handleJoinChannel = useCallback(async (serverId: string, channel: string) => {
    const result = await joinIrcChannel(serverId, channel);
    if (result.ok) {
      const normalizedChannel = channel.startsWith("#") ? channel : `#${channel}`;
      subscribeToChannel(serverId, normalizedChannel);
    }
    return result;
  }, [joinIrcChannel, subscribeToChannel]);

  // Handle leaving a channel
  const handlePartChannel = useCallback(async (serverId: string, channel: string) => {
    const normalizedChannel = channel.startsWith("#") ? channel : `#${channel}`;
    unsubscribeFromChannel(serverId, normalizedChannel);
    return await partIrcChannel(serverId, normalizedChannel);
  }, [partIrcChannel, unsubscribeFromChannel]);

  // Handle sending a message
  const handleSendMessage = useCallback(async (serverId: string, channel: string, content: string) => {
    return await sendIrcMessage(serverId, channel, content);
  }, [sendIrcMessage]);

  // Get current channel messages
  const currentChannelMessages = currentIrcChannel
    ? ircMessages[`${currentIrcChannel.serverId}:${currentIrcChannel.channel}`] || []
    : [];

  return {
    ircServers,
    ircChannels,
    currentIrcChannel,
    currentChannelMessages,
    handleConnect,
    handleDisconnect,
    handleJoinChannel,
    handlePartChannel,
    handleSendMessage,
    setCurrentIrcChannel,
  };
}
