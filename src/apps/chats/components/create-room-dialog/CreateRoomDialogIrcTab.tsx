import { ArrowClockwise, Plus, Trash } from "@phosphor-icons/react";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ThemedTabsContent } from "@/components/shared/ThemedTabs";
import { cn } from "@/lib/utils";
import type { CreateRoomDialogViewModel } from "./useCreateRoomDialog";

export function CreateRoomDialogIrcTab(vm: CreateRoomDialogViewModel) {
  const {
    isAdmin,
    isLoading,
    theme,
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
    channelFilter,
    setChannelFilter,
    channelListFilter,
    setChannelListFilter,
    selectedChannel,
    setSelectedChannel,
    customChannel,
    setCustomChannel,
    channelsTruncated,
    ircChannels,
    isLoadingChannels,
    channelsError,
    filteredChannels,
    selectedServer,
    loadIrcChannels,
    handleAddIrcServer,
    handleDeleteIrcServer,
  } = vm;
  const { themeFont, themeFontStyle } = theme;

  return (
    <ThemedTabsContent value="irc">
<div className="p-4 space-y-3 min-w-0 w-full max-w-full">
              {/* Step 1: Server picker */}
              <div className="space-y-2">
                <Label
                  htmlFor="irc-server"
                  className={cn("text-neutral-700", themeFont)}
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
                            className={cn(themeFont, "text-os-link")}
                          >
                            <span className="inline-flex items-center gap-1">
                              <Plus className="size-3" weight="bold" />
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
                      className="size-8 p-0"
                      title="Remove server"
                      aria-label="Remove server"
                    >
                      <Trash className="size-3" weight="bold" />
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
                <div className="space-y-2 border border-neutral-300 rounded p-3 bg-neutral-50">
                  <Label
                    className={cn("text-neutral-700 font-semibold", themeFont)}
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
                        className="size-4"
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
                        dispatchIrcServerForm({ type: "resetForm" });
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
                      className={cn("text-neutral-500 text-[11px]", themeFont)}
                      style={themeFontStyle}
                    >
                      IRC servers are managed by an admin. Choose a channel
                      from the list to join.
                    </p>
                  )}
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="irc-channel-filter"
                      className={cn("text-neutral-700", themeFont)}
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
                          "size-3",
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
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500"
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
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500"
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
                    <ScrollArea className="h-[200px] w-full min-w-0 max-w-full overflow-x-hidden border border-neutral-300 rounded-md bg-white">
                      <div className="min-w-0 max-w-full overflow-x-hidden">
                        {filteredChannels.length === 0 &&
                          !(isAdmin && customChannel) && (
                            <p
                              className={cn(
                                "text-neutral-500 px-2 py-1.5",
                                themeFont
                              )}
                              style={themeFontStyle}
                            >
                              {isAdmin
                                ? "No channels available. Type a channel name above to join one anyway."
                                : "No channels match this filter."}
                            </p>
                          )}
                        {filteredChannels.map((entry, index) => {
                          const isSelected =
                            selectedChannel === entry.channel && !customChannel;
                          const subline = [
                            `${entry.numUsers} user${
                              entry.numUsers === 1 ? "" : "s"
                            }`,
                            entry.topic,
                          ]
                            .filter(Boolean)
                            .join(" • ");
                          return (
                            <div
                              key={entry.channel}
                              role="button"
                              tabIndex={isLoading ? -1 : 0}
                              onClick={() => {
                                if (isLoading) return;
                                setSelectedChannel(entry.channel);
                                setCustomChannel("");
                                setChannelFilter("");
                                setChannelListFilter("");
                              }}
                              onKeyDown={(e) => {
                                if (isLoading) return;
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setSelectedChannel(entry.channel);
                                  setCustomChannel("");
                                  setChannelFilter("");
                                  setChannelListFilter("");
                                }
                              }}
                              data-selected={isSelected ? "true" : undefined}
                              aria-disabled={isLoading}
                              className={cn(
                                "px-2 py-1.5 w-full min-w-0 max-w-full overflow-hidden text-left box-border",
                                isLoading
                                  ? "cursor-not-allowed opacity-60"
                                  : "cursor-pointer",
                                !isSelected &&
                                  (index % 2 === 1 ? "bg-neutral-100" : "bg-white"),
                                themeFont
                              )}
                              style={themeFontStyle}
                            >
                              <div className="font-semibold truncate">
                                {entry.channel}
                              </div>
                              {subline ? (
                                <div
                                  className={cn(
                                    "truncate",
                                    isSelected
                                      ? "opacity-80"
                                      : "text-neutral-600"
                                  )}
                                >
                                  {subline}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}
                  {channelsTruncated && (
                    <p
                      className={cn(
                        "text-neutral-500 min-w-0 max-w-full break-words",
                        themeFont
                      )}
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
                      className={cn(
                        "text-neutral-500 min-w-0 max-w-full break-words",
                        themeFont
                      )}
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
  );
}
