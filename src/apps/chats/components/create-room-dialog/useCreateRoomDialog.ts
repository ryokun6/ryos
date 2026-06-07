import { useState, useEffect, useRef, useCallback, useReducer } from "react";
import { useTranslation } from "react-i18next";
import { type User } from "@/types/chat";
import { abortableFetch } from "@/utils/abortableFetch";
import {
  createIrcServer as createIrcServerApi,
  deleteIrcServer as deleteIrcServerApi,
  listIrcChannels as listIrcChannelsApi,
  listIrcServers as listIrcServersApi,
  type IrcChannelEntry,
  type IrcServerSummary,
} from "@/api/irc";
import type { CreateRoomIrcOptions } from "@/shared/contracts/chat";
import { ApiRequestError } from "@/api/core";
import {
  initialIrcServerFormState,
  ircServerFormReducer,
} from "./irc-server-form-reducer";
import type { CreateRoomDialogProps } from "./types";
import { useCreateRoomDialogTheme } from "./useCreateRoomDialogTheme";

export function useCreateRoomDialog({
  isOpen,
  onOpenChange,
  onSubmit,
  isAdmin,
  currentUsername,
  initialUsers = [],
}: CreateRoomDialogProps) {
  const { t } = useTranslation();
  const theme = useCreateRoomDialogTheme();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomName, setRoomName] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"public" | "private" | "irc">(
    "private"
  );
  const [isSearching, setIsSearching] = useState(false);

  // IRC server picker state
  const [ircServers, setIrcServers] = useState<IrcServerSummary[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [isLoadingServers, setIsLoadingServers] = useState(false);
  const [serversError, setServersError] = useState<string | null>(null);
  const [ircServerFormState, dispatchIrcServerForm] = useReducer(
    ircServerFormReducer,
    initialIrcServerFormState
  );
  const {
    showAddServerForm,
    newServerHost,
    newServerPort,
    newServerTls,
    newServerLabel,
    isAddingServer,
    addServerError,
  } = ircServerFormState;
  const setShowAddServerForm = useCallback((value: boolean) => {
    dispatchIrcServerForm({ type: "setShowAddServerForm", value });
  }, []);
  const setNewServerHost = useCallback((value: string) => {
    dispatchIrcServerForm({ type: "setNewServerHost", value });
  }, []);
  const setNewServerPort = useCallback((value: number) => {
    dispatchIrcServerForm({ type: "setNewServerPort", value });
  }, []);
  const setNewServerTls = useCallback((value: boolean) => {
    dispatchIrcServerForm({ type: "setNewServerTls", value });
  }, []);
  const setNewServerLabel = useCallback((value: string) => {
    dispatchIrcServerForm({ type: "setNewServerLabel", value });
  }, []);
  const setIsAddingServer = useCallback((value: boolean) => {
    dispatchIrcServerForm({ type: "setIsAddingServer", value });
  }, []);
  const setAddServerError = useCallback((value: string | null) => {
    dispatchIrcServerForm({ type: "setAddServerError", value });
  }, []);

  // IRC channel browser state
  const [ircChannels, setIrcChannels] = useState<IrcChannelEntry[]>([]);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState("");
  /** Filter text for the channel list only (non-admins cannot type arbitrary channels). */
  const [channelListFilter, setChannelListFilter] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [customChannel, setCustomChannel] = useState("");
  const [channelsTruncated, setChannelsTruncated] = useState(false);

  const searchRequestIdRef = useRef(0);
  const channelRequestIdRef = useRef(0);
  /** Stable key so parent re-renders with a new `initialUsers` array do not reset the dialog. */
  const initialUsersKey = initialUsers.join("\0");

  // Reset form when the dialog opens or when the prefilled user list actually changes.
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setRoomName("");
    setSelectedUsers([...initialUsers]);
    setSearchTerm("");
    setUsers([]);
    // Reset IRC tab state
    setIrcServers([]);
    setSelectedServerId(null);
    setServersError(null);
    dispatchIrcServerForm({ type: "resetForm" });
    setIrcChannels([]);
    setChannelsError(null);
    setChannelFilter("");
    setChannelListFilter("");
    setSelectedChannel(null);
    setCustomChannel("");
    setChannelsTruncated(false);
    setActiveTab("private");
  }, [isOpen, initialUsersKey]);

  const searchUsers = useCallback(async (query: string) => {
    const requestId = ++searchRequestIdRef.current;
    setIsSearching(true);
    try {
      const response = await abortableFetch(
        `/api/users?search=${encodeURIComponent(query)}`,
        {
          timeout: 10000,
          retry: { maxAttempts: 1, initialDelayMs: 250 },
        }
      );
      const data = await response.json();

      if (requestId !== searchRequestIdRef.current) {
        return;
      }

      const usersList = data.users || [];
      // Filter out current user
      const filteredUsers = usersList.filter(
        (u: User) => u.username !== currentUsername?.toLowerCase()
      );
      setUsers(filteredUsers);
    } catch (error) {
      if (requestId !== searchRequestIdRef.current) {
        return;
      }
      console.error("Failed to search users:", error);
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setIsSearching(false);
      }
    }
  }, [currentUsername]);

  // Search for users when search term changes (with debouncing)
  useEffect(() => {
    if (searchTerm.length < 2) {
      searchRequestIdRef.current += 1;
      setUsers([]);
      setIsSearching(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      searchUsers(searchTerm);
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchTerm, searchUsers]);

  // Fetch the list of IRC servers when the IRC tab becomes visible. Auto-
  // selects the default (irc.pieter.com) server on first load.
  const loadIrcServers = useCallback(async () => {
    setIsLoadingServers(true);
    setServersError(null);
    try {
      const data = await listIrcServersApi();
      const servers = data.servers || [];
      setIrcServers(servers);
      setSelectedServerId((current) => {
        if (current && servers.some((s) => s.id === current)) return current;
        const def = servers.find((s) => s.isDefault) || servers[0];
        return def?.id ?? null;
      });
    } catch (err) {
      console.error("Failed to load IRC servers:", err);
      setServersError(
        err instanceof ApiRequestError
          ? err.message
          : "Failed to load IRC servers"
      );
    } finally {
      setIsLoadingServers(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (activeTab !== "irc") return;
    if (ircServers.length > 0 || isLoadingServers) return;
    void loadIrcServers();
  }, [isOpen, activeTab, ircServers.length, isLoadingServers, loadIrcServers]);

  // Fetch the channel list whenever the selected server changes.
  const loadIrcChannels = useCallback(
    async (serverId: string) => {
      const requestId = ++channelRequestIdRef.current;
      setIsLoadingChannels(true);
      setChannelsError(null);
      setIrcChannels([]);
      setChannelsTruncated(false);
      try {
        const data = await listIrcChannelsApi(serverId, { limit: 500 });
        if (requestId !== channelRequestIdRef.current) return;
        const channels = data.channels || [];
        setIrcChannels(channels);
        setChannelsTruncated(Boolean(data.truncated));
        // Pre-select the first / default channel where applicable.
        setSelectedChannel((current) => {
          if (current && channels.some((c) => c.channel === current)) {
            return current;
          }
          if (channels.length > 0) return channels[0].channel;
          return null;
        });
      } catch (err) {
        if (requestId !== channelRequestIdRef.current) return;
        console.error("Failed to load IRC channels:", err);
        setChannelsError(
          err instanceof ApiRequestError
            ? err.message
            : "Failed to load IRC channels"
        );
      } finally {
        if (requestId === channelRequestIdRef.current) {
          setIsLoadingChannels(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!isOpen) return;
    if (activeTab !== "irc") return;
    if (!selectedServerId) return;
    setSelectedChannel(null);
    setChannelFilter("");
    setChannelListFilter("");
    setCustomChannel("");
    void loadIrcChannels(selectedServerId);
  }, [isOpen, activeTab, selectedServerId, loadIrcChannels]);

  const handleAddIrcServer = useCallback(async () => {
    setAddServerError(null);
    const trimmedHost = newServerHost.trim();
    if (!trimmedHost) {
      setAddServerError("Server host is required");
      return;
    }
    setIsAddingServer(true);
    try {
      const data = await createIrcServerApi({
        host: trimmedHost,
        port: Number(newServerPort) || 6667,
        tls: Boolean(newServerTls),
        label: newServerLabel.trim() || undefined,
      });
      setIrcServers((prev) => {
        const next = prev.filter((s) => s.id !== data.server.id);
        next.push(data.server);
        next.sort((a, b) => {
          if (a.isDefault && !b.isDefault) return -1;
          if (!a.isDefault && b.isDefault) return 1;
          return a.label.localeCompare(b.label);
        });
        return next;
      });
      setSelectedServerId(data.server.id);
      dispatchIrcServerForm({ type: "resetForm" });
    } catch (err) {
      console.error("Failed to add IRC server:", err);
      setAddServerError(
        err instanceof ApiRequestError
          ? err.message
          : "Failed to add IRC server"
      );
    } finally {
      setIsAddingServer(false);
    }
  }, [newServerHost, newServerPort, newServerTls, newServerLabel]);

  const handleDeleteIrcServer = useCallback(
    async (server: IrcServerSummary) => {
      if (server.isDefault) return;
      try {
        await deleteIrcServerApi(server.id);
        setIrcServers((prev) => prev.filter((s) => s.id !== server.id));
        setSelectedServerId((current) => {
          if (current !== server.id) return current;
          return ircServers.find((s) => s.id !== server.id)?.id ?? null;
        });
      } catch (err) {
        console.error("Failed to delete IRC server:", err);
        setServersError(
          err instanceof ApiRequestError
            ? err.message
            : "Failed to delete IRC server"
        );
      }
    },
    [ircServers]
  );

  const filteredChannels = (() => {
    const term = (isAdmin ? channelFilter : channelListFilter)
      .trim()
      .toLowerCase();
    if (!term) return ircChannels;
    return ircChannels.filter((entry) => {
      const channelMatch = entry.channel.toLowerCase().includes(term);
      const topicMatch =
        typeof entry.topic === "string" &&
        entry.topic.toLowerCase().includes(term);
      return channelMatch || topicMatch;
    });
  })();

  const selectedServer =
    ircServers.find((s) => s.id === selectedServerId) ?? null;

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);

    try {
      let ircOptions: CreateRoomIrcOptions | undefined;
      let resolvedRoomName = roomName;

      if (activeTab === "irc") {
        const server = selectedServer;
        if (!server) {
          setError("Please pick an IRC server first.");
          setIsLoading(false);
          return;
        }
        const rawChannel = (
          isAdmin
            ? customChannel.trim() || selectedChannel || ""
            : selectedChannel || ""
        ).trim();
        if (!rawChannel) {
          setError(
            isAdmin
              ? "Please pick or enter an IRC channel."
              : "Please pick a channel from the list."
          );
          setIsLoading(false);
          return;
        }
        const normalizedChannel = rawChannel.startsWith("#")
          ? rawChannel
          : `#${rawChannel}`;
        ircOptions = {
          ircServerId: server.id,
          ircHost: server.host,
          ircPort: server.port,
          ircTls: server.tls,
          ircChannel: normalizedChannel,
          ircServerLabel: server.label,
        };
        resolvedRoomName = normalizedChannel.replace(/^#/, "").toLowerCase();
      }

      const result = await onSubmit(
        resolvedRoomName,
        activeTab,
        selectedUsers,
        ircOptions
      );

      if (result.ok) {
        onOpenChange(false);
      } else {
        setError(result.error || t("apps.chats.dialogs.failedToCreateRoom"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const toggleUserSelection = (username: string) => {
    setSelectedUsers((prev) =>
      prev.includes(username)
        ? prev.filter((u) => u !== username)
        : [...prev, username]
    );
  };


  const submitDisabled =
    isLoading ||
    (activeTab === "public" && !roomName.trim()) ||
    (activeTab === "private" && selectedUsers.length === 0) ||
    (activeTab === "irc" &&
      (!selectedServerId ||
        (isAdmin && showAddServerForm) ||
        (isAdmin
          ? !(customChannel.trim() || selectedChannel)
          : !selectedChannel)));

  return {
    t,
    theme,
    isAdmin,
    isLoading,
    error,
    roomName,
    setRoomName,
    selectedUsers,
    users,
    searchTerm,
    setSearchTerm,
    activeTab,
    setActiveTab,
    isSearching,
    ircServers,
    selectedServerId,
    setSelectedServerId,
    isLoadingServers,
    serversError,
    showAddServerForm,
    setShowAddServerForm,
    newServerHost,
    setNewServerHost,
    newServerPort,
    setNewServerPort,
    newServerTls,
    setNewServerTls,
    newServerLabel,
    setNewServerLabel,
    isAddingServer,
    addServerError,
    dispatchIrcServerForm,
    ircChannels,
    isLoadingChannels,
    channelsError,
    channelFilter,
    setChannelFilter,
    channelListFilter,
    setChannelListFilter,
    selectedChannel,
    setSelectedChannel,
    customChannel,
    setCustomChannel,
    channelsTruncated,
    filteredChannels,
    selectedServer,
    loadIrcChannels,
    handleAddIrcServer,
    handleDeleteIrcServer,
    handleSubmit,
    toggleUserSelection,
    submitDisabled,
    onOpenChange,
  };
}

export type CreateRoomDialogViewModel = ReturnType<typeof useCreateRoomDialog>;
