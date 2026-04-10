import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Trash, Plus, ArrowClockwise } from "@phosphor-icons/react";
import { type User } from "@/types/chat";
import { useThemeStore } from "@/stores/useThemeStore";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { abortableFetch } from "@/utils/abortableFetch";
import {
  ThemedTabsList,
  ThemedTabsTrigger,
  ThemedTabsContent,
} from "@/components/shared/ThemedTabs";
import {
  createIrcServer as createIrcServerApi,
  deleteIrcServer as deleteIrcServerApi,
  listIrcChannels as listIrcChannelsApi,
  listIrcServers as listIrcServersApi,
  type IrcChannelEntry,
  type IrcServerSummary,
} from "@/api/irc";
import { ApiRequestError } from "@/api/core";

interface CreateRoomDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    name: string,
    type: "public" | "private" | "irc",
    members: string[],
    ircOptions?: {
      ircServerId?: string;
      ircHost?: string;
      ircPort?: number;
      ircTls?: boolean;
      ircChannel?: string;
      ircServerLabel?: string;
    }
  ) => Promise<{ ok: boolean; error?: string }>;
  isAdmin: boolean;
  currentUsername: string | null;
  initialUsers?: string[]; // Optional prop to prefill users
}

export function CreateRoomDialog({
  isOpen,
  onOpenChange,
  onSubmit,
  isAdmin,
  currentUsername,
  initialUsers = [],
}: CreateRoomDialogProps) {
  const { t } = useTranslation();
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
  const [showAddServerForm, setShowAddServerForm] = useState(false);
  const [newServerHost, setNewServerHost] = useState("");
  const [newServerPort, setNewServerPort] = useState(6667);
  const [newServerTls, setNewServerTls] = useState(false);
  const [newServerLabel, setNewServerLabel] = useState("");
  const [isAddingServer, setIsAddingServer] = useState(false);
  const [addServerError, setAddServerError] = useState<string | null>(null);

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

  // Theme detection
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      // Reset form when opening
      setError(null);
      setRoomName("");
      setSelectedUsers(initialUsers); // Use initialUsers if provided
      setSearchTerm("");
      setUsers([]);
      // Reset IRC tab state
      setIrcServers([]);
      setSelectedServerId(null);
      setServersError(null);
      setShowAddServerForm(false);
      setNewServerHost("");
      setNewServerPort(6667);
      setNewServerTls(false);
      setNewServerLabel("");
      setIsAddingServer(false);
      setAddServerError(null);
      setIrcChannels([]);
      setChannelsError(null);
      setChannelFilter("");
      setChannelListFilter("");
      setSelectedChannel(null);
      setCustomChannel("");
      setChannelsTruncated(false);
      // Reset to private tab when opening
      setActiveTab("private");
    }
  }, [isOpen, initialUsers]);

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
      setShowAddServerForm(false);
      setNewServerHost("");
      setNewServerPort(6667);
      setNewServerTls(false);
      setNewServerLabel("");
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
      let ircOptions:
        | {
            ircServerId?: string;
            ircHost?: string;
            ircPort?: number;
            ircTls?: boolean;
            ircChannel?: string;
            ircServerLabel?: string;
          }
        | undefined;
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

  const themeFont = isXpTheme
    ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
    : "font-geneva-12 text-[12px]";

  const themeFontStyle: React.CSSProperties | undefined = isXpTheme
    ? {
        fontFamily: '"Pixelated MS Sans Serif", "ArkPixel", Arial',
        fontSize: "11px",
      }
    : undefined;

  const dialogContent = (
    <div className={isXpTheme ? "pt-2 pb-6 px-4" : "pt-3 pb-6 px-6"}>
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "public" | "private" | "irc")}
        className="w-full"
      >
        <ThemedTabsList
          className={cn(
            "grid w-full",
            isAdmin ? "grid-cols-3" : "grid-cols-2"
          )}
        >
          <ThemedTabsTrigger value="private">
            {t("apps.chats.sidebar.private")}
          </ThemedTabsTrigger>
          {isAdmin && (
            <ThemedTabsTrigger value="public">
              {t("apps.chats.dialogs.public")}
            </ThemedTabsTrigger>
          )}
          <ThemedTabsTrigger value="irc">IRC</ThemedTabsTrigger>
        </ThemedTabsList>

        {isAdmin && (
          <ThemedTabsContent value="public">
            <div className="p-4">
              <div className="space-y-2">
                <Label
                  htmlFor="room-name"
                  className={cn("text-gray-700", themeFont)}
                  style={themeFontStyle}
                >
                  {t("apps.chats.dialogs.roomName")}
                </Label>
                <div className="relative">
                  <span
                    className={cn(
                      "absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none",
                      themeFont
                    )}
                    style={themeFontStyle}
                  >
                    #
                  </span>
                  <Input
                    id="room-name"
                    value={roomName}
                    onChange={(e) => {
                      // Remove # if user types it
                      const value = e.target.value.replace(/^#/, "");
                      setRoomName(value);
                    }}
                    placeholder={t("apps.chats.dialogs.roomNamePlaceholder")}
                    className={cn("shadow-none h-8 pl-6", themeFont)}
                    style={themeFontStyle}
                    disabled={isLoading}
                  />
                </div>
              </div>
            </div>
          </ThemedTabsContent>
        )}

        <ThemedTabsContent value="irc">
            <div className="p-4 space-y-3">
              {/* Step 1: Server picker */}
              <div className="space-y-2">
                <Label
                  htmlFor="irc-server"
                  className={cn("text-gray-700", themeFont)}
                  style={themeFontStyle}
                >
                  Server
                </Label>
                <div className="flex items-center gap-1">
                  <div className="flex-1 min-w-0">
                    <Select
                      value={selectedServerId ?? undefined}
                      onValueChange={(v) => {
                        if (v === "__add__") {
                          setShowAddServerForm(true);
                          return;
                        }
                        setSelectedServerId(v);
                      }}
                      disabled={isLoading || isLoadingServers}
                    >
                      <SelectTrigger
                        id="irc-server"
                        className={cn("h-8", themeFont)}
                        style={themeFontStyle}
                      >
                        <SelectValue
                          placeholder={
                            isLoadingServers ? "Loading…" : "Pick a server"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {ircServers.map((server) => (
                          <SelectItem
                            key={server.id}
                            value={server.id}
                            className={themeFont}
                          >
                            <span className="flex items-center gap-1.5">
                              <span>{server.label}</span>
                              {server.isDefault && (
                                <span className="text-[9px] uppercase tracking-wider text-purple-600/70">
                                  default
                                </span>
                              )}
                              {server.tls && (
                                <span className="text-[9px] uppercase tracking-wider text-emerald-600/70">
                                  tls
                                </span>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                        {isAdmin && (
                          <SelectItem
                            value="__add__"
                            className={cn(themeFont, "text-blue-600")}
                          >
                            <span className="inline-flex items-center gap-1">
                              <Plus className="h-3 w-3" weight="bold" />
                              Add new server…
                            </span>
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  {isAdmin &&
                    selectedServer &&
                    !selectedServer.isDefault && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteIrcServer(selectedServer)}
                      disabled={isLoading}
                      className="h-8 w-8 p-0"
                      title="Remove server"
                      aria-label="Remove server"
                    >
                      <Trash className="h-3 w-3" weight="bold" />
                    </Button>
                  )}
                </div>
                {serversError && (
                  <p
                    className={cn("text-red-600", themeFont)}
                    style={themeFontStyle}
                  >
                    {serversError}
                  </p>
                )}
              </div>

              {/* Inline "add server" form */}
              {isAdmin && showAddServerForm && (
                <div className="space-y-2 border border-gray-300 rounded p-3 bg-gray-50">
                  <Label
                    className={cn("text-gray-700 font-semibold", themeFont)}
                    style={themeFontStyle}
                  >
                    Add a server
                  </Label>
                  <Input
                    placeholder="irc.example.com"
                    value={newServerHost}
                    onChange={(e) => setNewServerHost(e.target.value)}
                    className={cn("shadow-none h-8", themeFont)}
                    style={themeFontStyle}
                    disabled={isAddingServer}
                  />
                  <Input
                    placeholder="Optional label"
                    value={newServerLabel}
                    onChange={(e) => setNewServerLabel(e.target.value)}
                    className={cn("shadow-none h-8", themeFont)}
                    style={themeFontStyle}
                    disabled={isAddingServer}
                  />
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <Input
                        type="number"
                        placeholder="6667"
                        value={String(newServerPort)}
                        onChange={(e) =>
                          setNewServerPort(Number(e.target.value) || 6667)
                        }
                        className={cn("shadow-none h-8", themeFont)}
                        style={themeFontStyle}
                        disabled={isAddingServer}
                      />
                    </div>
                    <Label
                      htmlFor="new-irc-tls"
                      className={cn(
                        "flex items-center gap-2 self-center",
                        themeFont
                      )}
                      style={themeFontStyle}
                    >
                      <Checkbox
                        id="new-irc-tls"
                        checked={newServerTls}
                        onCheckedChange={(v) => setNewServerTls(Boolean(v))}
                        className="h-4 w-4"
                        disabled={isAddingServer}
                      />
                      <span>TLS</span>
                    </Label>
                  </div>
                  {addServerError && (
                    <p
                      className={cn("text-red-600", themeFont)}
                      style={themeFontStyle}
                    >
                      {addServerError}
                    </p>
                  )}
                  <div className="flex gap-2 justify-end">
                    <Button
                      type="button"
                      variant="retro"
                      size="sm"
                      onClick={() => {
                        setShowAddServerForm(false);
                        setAddServerError(null);
                      }}
                      disabled={isAddingServer}
                      className={cn("h-7", themeFont)}
                      style={themeFontStyle}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="retro"
                      size="sm"
                      onClick={handleAddIrcServer}
                      disabled={isAddingServer || !newServerHost.trim()}
                      className={cn("h-7", themeFont)}
                      style={themeFontStyle}
                    >
                      {isAddingServer ? "Adding…" : "Add server"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 2: Channel browser */}
              {selectedServerId && (!isAdmin || !showAddServerForm) && (
                <div className="space-y-2">
                  {!isAdmin && (
                    <p
                      className={cn("text-gray-500 text-[11px]", themeFont)}
                      style={themeFontStyle}
                    >
                      IRC servers are managed by an admin. Choose a channel
                      from the list to join.
                    </p>
                  )}
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="irc-channel-filter"
                      className={cn("text-gray-700", themeFont)}
                      style={themeFontStyle}
                    >
                      Channel
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => loadIrcChannels(selectedServerId)}
                      disabled={isLoadingChannels || isLoading}
                      className="h-7 px-2"
                      title="Refresh channel list"
                      aria-label="Refresh channel list"
                    >
                      <ArrowClockwise
                        className={cn(
                          "h-3 w-3",
                          isLoadingChannels && "animate-spin"
                        )}
                        weight="bold"
                      />
                    </Button>
                  </div>
                  {isAdmin ? (
                    <div className="relative">
                      <Input
                        id="irc-channel-filter"
                        placeholder={
                          isLoadingChannels
                            ? "Loading channels…"
                            : "Filter channels or type a new one"
                        }
                        value={channelFilter || customChannel}
                        onChange={(e) => {
                          const v = e.target.value;
                          setChannelFilter(v);
                          const match = ircChannels.find(
                            (c) => c.channel.toLowerCase() === v.toLowerCase()
                          );
                          if (match) {
                            setSelectedChannel(match.channel);
                            setCustomChannel("");
                          } else if (v.startsWith("#") || v.startsWith("&")) {
                            setCustomChannel(v);
                            setSelectedChannel(null);
                          } else {
                            setCustomChannel("");
                          }
                        }}
                        className={cn("shadow-none h-8", themeFont)}
                        style={themeFontStyle}
                        disabled={isLoading || isLoadingChannels}
                      />
                      {isLoadingChannels && (
                        <ActivityIndicator
                          size="sm"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500"
                        />
                      )}
                    </div>
                  ) : (
                    <div className="relative">
                      <Input
                        id="irc-channel-filter"
                        placeholder={
                          isLoadingChannels
                            ? "Loading channels…"
                            : "Filter channels"
                        }
                        value={channelListFilter}
                        onChange={(e) => {
                          setChannelListFilter(e.target.value);
                        }}
                        className={cn("shadow-none h-8", themeFont)}
                        style={themeFontStyle}
                        disabled={isLoading || isLoadingChannels}
                      />
                      {isLoadingChannels && (
                        <ActivityIndicator
                          size="sm"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500"
                        />
                      )}
                    </div>
                  )}
                  {channelsError && (
                    <p
                      className={cn("text-red-600", themeFont)}
                      style={themeFontStyle}
                    >
                      {channelsError}
                    </p>
                  )}
                  {!isLoadingChannels && !channelsError && (
                    <div className="border border-gray-300 rounded max-h-[180px] overflow-y-auto bg-white">
                      <div className="p-1">
                        {filteredChannels.length === 0 &&
                          !(isAdmin && customChannel) && (
                          <p
                            className={cn(
                              "text-gray-500 px-2 py-2",
                              themeFont
                            )}
                            style={themeFontStyle}
                          >
                            {isAdmin
                              ? "No channels available. Type a channel name above to join one anyway."
                              : "No channels match this filter."}
                          </p>
                        )}
                        {filteredChannels.map((entry) => {
                          const isSelected =
                            selectedChannel === entry.channel && !customChannel;
                          return (
                            <button
                              key={entry.channel}
                              type="button"
                              onClick={() => {
                                setSelectedChannel(entry.channel);
                                setCustomChannel("");
                                setChannelFilter("");
                                setChannelListFilter("");
                              }}
                              className={cn(
                                "w-full text-left flex items-center gap-2 p-2 rounded",
                                isSelected
                                  ? "bg-blue-100 text-blue-900"
                                  : "hover:bg-gray-100",
                                themeFont
                              )}
                              style={themeFontStyle}
                              disabled={isLoading}
                            >
                              <span className="font-semibold whitespace-nowrap">
                                {entry.channel}
                              </span>
                              <span className="text-[10px] text-gray-500 shrink-0">
                                {entry.numUsers} user
                                {entry.numUsers === 1 ? "" : "s"}
                              </span>
                              {entry.topic && (
                                <span className="ml-1 text-gray-500 truncate">
                                  {entry.topic}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {channelsTruncated && (
                    <p
                      className={cn("text-gray-500", themeFont)}
                      style={themeFontStyle}
                    >
                      Showing first {ircChannels.length} channels — refine the
                      filter to see more.
                    </p>
                  )}
                  {((isAdmin &&
                    (customChannel || (selectedChannel && !customChannel))) ||
                    (!isAdmin && selectedChannel)) && (
                    <p
                      className={cn("text-gray-500", themeFont)}
                      style={themeFontStyle}
                    >
                      Will create a room bridged to{" "}
                      <span className="font-semibold">
                        {isAdmin
                          ? customChannel || selectedChannel
                          : selectedChannel}
                      </span>{" "}
                      on{" "}
                      <span className="font-semibold">
                        {selectedServer?.label ?? "irc.pieter.com"}
                      </span>
                      .
                    </p>
                  )}
                </div>
              )}
            </div>
          </ThemedTabsContent>

        <ThemedTabsContent value="private">
          <div className="p-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label
                  htmlFor="search-users"
                  className={cn("text-gray-700", themeFont)}
                  style={themeFontStyle}
                >
                  {t("apps.chats.dialogs.addUsersToPrivateChat")}
                </Label>
                <div className="relative">
                  <Input
                    id="search-users"
                    placeholder={t(
                      "apps.chats.dialogs.searchUsernamePlaceholder"
                    )}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={cn("shadow-none h-8 pr-8", themeFont)}
                    style={themeFontStyle}
                    disabled={isLoading}
                  />
                  {isSearching && searchTerm.length >= 2 && (
                    <ActivityIndicator
                      size="sm"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500"
                    />
                  )}
                </div>

                {/* Selected users tokens */}
                {selectedUsers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selectedUsers.map((username) => (
                      <Badge
                        key={username}
                        variant="secondary"
                        className={cn(
                          "py-0.5 pl-2 pr-1 bg-gray-100 hover:bg-gray-200 border-gray-300",
                          isXpTheme
                            ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[10px]"
                            : "font-geneva-12 text-[11px]"
                        )}
                        style={
                          isXpTheme
                            ? {
                                fontFamily:
                                  '"Pixelated MS Sans Serif", "ArkPixel", Arial',
                                fontSize: "10px",
                              }
                            : undefined
                        }
                      >
                        @{username}
                        <button
                          type="button"
                          onClick={() => toggleUserSelection(username)}
                          className="ml-1 hover:bg-gray-300 rounded-sm p-0.5"
                          disabled={isLoading}
                        >
                          <X className="h-3 w-3" weight="bold" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Show results */}
              {!isSearching && searchTerm.length >= 2 && users.length > 0 && (
                <div className="border border-gray-300 rounded max-h-[180px] overflow-y-auto bg-white">
                  <div className="p-1">
                    {users.map((user) => (
                      <label
                        key={user.username}
                        className={cn(
                          "flex items-center p-2 hover:bg-gray-100 cursor-pointer rounded",
                          themeFont
                        )}
                        style={themeFontStyle}
                      >
                        <Checkbox
                          checked={selectedUsers.includes(user.username)}
                          onCheckedChange={() =>
                            toggleUserSelection(user.username)
                          }
                          className="h-4 w-4"
                          disabled={isLoading}
                        />
                        <span className="ml-2">@{user.username}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </ThemedTabsContent>
      </Tabs>

      {error && (
        <p
          className={cn("text-red-600 mt-3", themeFont)}
          style={themeFontStyle}
        >
          {error}
        </p>
      )}

      <DialogFooter className="mt-4 gap-1 sm:gap-0">
        <Button
          variant="retro"
          onClick={() => onOpenChange(false)}
          disabled={isLoading}
          className={cn("h-7", themeFont)}
          style={themeFontStyle}
        >
          {t("apps.chats.dialogs.cancel")}
        </Button>
        <Button
          variant="retro"
          onClick={handleSubmit}
          disabled={
            isLoading ||
            (activeTab === "public" && !roomName.trim()) ||
            (activeTab === "private" && selectedUsers.length === 0) ||
            (activeTab === "irc" &&
              (!selectedServerId ||
                (isAdmin && showAddServerForm) ||
                (isAdmin
                  ? !(customChannel.trim() || selectedChannel)
                  : !selectedChannel)))
          }
          className={cn("h-7", themeFont)}
          style={themeFontStyle}
        >
          {isLoading
            ? t("apps.chats.dialogs.creating")
            : t("apps.chats.dialogs.create")}
        </Button>
      </DialogFooter>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          activeTab === "irc" ? "max-w-[480px]" : "max-w-[400px]",
          isXpTheme && "p-0 overflow-hidden"
        )}
        style={isXpTheme ? { fontSize: "11px" } : undefined}
      >
        {isXpTheme ? (
          <>
            <DialogHeader>
              {t("apps.chats.dialogs.newChatTitle")}
            </DialogHeader>
            <div className="window-body">{dialogContent}</div>
          </>
        ) : currentTheme === "macosx" ? (
          <>
            <DialogHeader>
              {t("apps.chats.dialogs.newChatTitle")}
            </DialogHeader>
            {dialogContent}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-normal text-[16px]">
                {t("apps.chats.dialogs.newChatTitle")}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {isAdmin
                  ? t("apps.chats.dialogs.newChatDescription")
                  : t("apps.chats.dialogs.newChatDescriptionPrivate")}
              </DialogDescription>
            </DialogHeader>
            {dialogContent}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
