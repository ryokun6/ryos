import { AppProps } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { AdminMenuBar } from "./AdminMenuBar";
import { AdminSidebar } from "./AdminSidebar";
import { UserProfilePanel } from "./UserProfilePanel";
import { SongDetailPanel } from "./SongDetailPanel";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { appMetadata } from "..";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MagnifyingGlass,
  Trash,
  ArrowsClockwise,
  Warning,
  Prohibit,
  MusicNote,
  UploadSimple,
  DownloadSimple,
  WifiSlash,
} from "@phosphor-icons/react";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useAdminLogic } from "../hooks/useAdminLogic";

export function AdminAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps) {
  const {
    t,
    translatedHelpItems,
    username,
    isAdmin,
    isOffline,
    currentTheme,
    isXpTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    deleteTarget,
    users,
    rooms,
    selectedRoomId,
    setSelectedRoomId,
    roomMessages,
    userSearch,
    setUserSearch,
    isLoading,
    visibleUsersCount,
    setVisibleUsersCount,
    USERS_PER_PAGE,
    stats,
    activeSection,
    setActiveSection,
    isRoomsExpanded,
    setIsRoomsExpanded,
    selectedUserProfile,
    setSelectedUserProfile,
    selectedSongId,
    setSelectedSongId,
    songs,
    songSearch,
    setSongSearch,
    visibleSongsCount,
    setVisibleSongsCount,
    SONGS_PER_PAGE,
    containerRef,
    scrollAreaRef,
    isSidebarVisible,
    toggleSidebarVisibility,
    isImporting,
    isExporting,
    isDeletingAll,
    fileInputRef,
    selectedRoom,
    fetchUsers,
    fetchStats,
    fetchSongs,
    deleteMessage,
    handleImportFile,
    handleExportLibrary,
    handleDeleteAllSongs,
    handleDeleteConfirm,
    handleRefresh,
    promptDelete,
    formatRelativeTime,
    formatKugouImageUrl,
  } = useAdminLogic({ isWindowOpen });

  const menuBar = (
    <AdminMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onRefresh={handleRefresh}
      onToggleSidebar={toggleSidebarVisibility}
      isSidebarVisible={isSidebarVisible}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
    />
  );

  if (!isWindowOpen) return null;

  // Access denied view
  if (!isAdmin) {
    return (
      <>
        {!isXpTheme && isForeground && menuBar}
        <WindowFrame
          title={t("apps.admin.title")}
          onClose={onClose}
          isForeground={isForeground}
          appId="admin"
          skipInitialSound={skipInitialSound}
          instanceId={instanceId}
          onNavigateNext={onNavigateNext}
          onNavigatePrevious={onNavigatePrevious}
          menuBar={isXpTheme ? menuBar : undefined}
        >
          <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center bg-white">
            <Warning className="h-10 w-10 text-neutral-400" weight="bold" />
            <h2 className="text-sm font-bold">
              {t("apps.admin.accessDenied.title")}
            </h2>
            <p className="text-xs text-neutral-500 max-w-xs">
              {t("apps.admin.accessDenied.description")}
            </p>
            {!username && (
              <p className="text-[11px] text-neutral-400">
                {t("apps.admin.accessDenied.loginPrompt")}
              </p>
            )}
          </div>
        </WindowFrame>
      </>
    );
  }

  // Offline view
  if (isOffline) {
    return (
      <>
        {!isXpTheme && isForeground && menuBar}
        <WindowFrame
          title={t("apps.admin.title")}
          onClose={onClose}
          isForeground={isForeground}
          appId="admin"
          skipInitialSound={skipInitialSound}
          instanceId={instanceId}
          onNavigateNext={onNavigateNext}
          onNavigatePrevious={onNavigatePrevious}
          menuBar={isXpTheme ? menuBar : undefined}
        >
          <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center bg-white">
            <WifiSlash className="h-10 w-10 text-neutral-400" weight="bold" />
            <h2 className="text-sm font-bold">
              {t("apps.admin.offline.title", "Offline")}
            </h2>
            <p className="text-xs text-neutral-500 max-w-xs">
              {t(
                "apps.admin.offline.description",
                "Admin requires an internet connection to manage data."
              )}
            </p>
          </div>
        </WindowFrame>
      </>
    );
  }

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={t("apps.admin.title")}
        onClose={onClose}
        isForeground={isForeground}
        appId="admin"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <div ref={containerRef} className="flex h-full w-full">
          {/* Sidebar */}
          <AdminSidebar
            activeSection={activeSection}
            onSectionChange={setActiveSection}
            rooms={rooms}
            selectedRoomId={selectedRoomId}
            onRoomSelect={setSelectedRoomId}
            isRoomsExpanded={isRoomsExpanded}
            onToggleRoomsExpanded={() => setIsRoomsExpanded(!isRoomsExpanded)}
            stats={stats}
            isVisible={isSidebarVisible}
          />

          {/* Main Content */}
          <div className="flex-1 flex flex-col bg-white overflow-hidden">
            {/* Toolbar */}
            {!selectedUserProfile && !selectedSongId && (
              <div
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 border-b",
                  isXpTheme
                    ? "border-[#919b9c]"
                    : currentTheme === "macosx"
                    ? "border-black/10"
                    : "border-black/20"
                )}
                style={
                  currentTheme === "macosx"
                    ? { backgroundImage: "var(--os-pinstripe-window)" }
                    : undefined
                }
              >
                {activeSection === "users" && !selectedRoomId && (
                  <div className="relative flex-1">
                    <MagnifyingGlass
                      className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400"
                      weight="bold"
                    />
                    <Input
                      placeholder={t("apps.admin.search.placeholder")}
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="pl-7 h-7 text-[12px]"
                    />
                  </div>
                )}

                {activeSection === "songs" && !selectedRoomId && (
                  <>
                    <div className="relative flex-1">
                      <MagnifyingGlass
                        className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400"
                        weight="bold"
                      />
                      <Input
                        placeholder={t(
                          "apps.admin.search.songsPlaceholder",
                          "Search songs..."
                        )}
                        value={songSearch}
                        onChange={(e) => setSongSearch(e.target.value)}
                        className="pl-7 h-7 text-[12px]"
                      />
                    </div>
                    {/* Import button */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json"
                      onChange={handleImportFile}
                      className="hidden"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isImporting || isExporting || isDeletingAll}
                      className="h-7 w-7 p-0"
                      title={t("apps.admin.songs.import", "Import Library")}
                    >
                      {isImporting ? (
                        <ActivityIndicator size={14} />
                      ) : (
                        <DownloadSimple size={14} weight="bold" />
                      )}
                    </Button>
                    {/* Export button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleExportLibrary}
                      disabled={
                        isExporting ||
                        isImporting ||
                        isDeletingAll ||
                        songs.length === 0
                      }
                      className="h-7 w-7 p-0"
                      title={t("apps.admin.songs.export", "Export Library")}
                    >
                      {isExporting ? (
                        <ActivityIndicator size={14} />
                      ) : (
                        <UploadSimple size={14} weight="bold" />
                      )}
                    </Button>
                    {/* Delete all button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDeleteAllSongs}
                      disabled={isDeletingAll || isImporting || songs.length === 0}
                      className="h-7 w-7 p-0"
                      title={t("apps.admin.songs.deleteAll", "Delete All Songs")}
                    >
                      {isDeletingAll ? (
                        <ActivityIndicator size={14} />
                      ) : (
                        <Trash size={14} weight="bold" />
                      )}
                    </Button>
                  </>
                )}

                {selectedRoomId && selectedRoom && (
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-[12px] font-medium">
                      # {selectedRoom.name}
                    </span>
                    <span className="text-[11px] text-neutral-500">
                      {t("apps.admin.room.messagesCount", {
                        count: roomMessages.length,
                      })}
                    </span>
                  </div>
                )}

                {selectedRoomId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      promptDelete("room", selectedRoomId, selectedRoom?.name || "")
                    }
                    className="h-7 w-7 p-0"
                  >
                    <Trash size={14} weight="bold" />
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefresh}
                  className="h-7 w-7 p-0"
                >
                  {isLoading ? (
                    <ActivityIndicator size={14} />
                  ) : (
                    <ArrowsClockwise size={14} weight="bold" />
                  )}
                </Button>
              </div>
            )}

            {/* Content Area */}
            <ScrollArea ref={scrollAreaRef} className="flex-1">
              {/* User Profile View */}
              {selectedUserProfile && (
                <UserProfilePanel
                  username={selectedUserProfile}
                  onBack={() => setSelectedUserProfile(null)}
                  onUserDeleted={() => {
                    fetchUsers(userSearch);
                    fetchStats();
                  }}
                />
              )}

              {/* Song Detail View */}
              {selectedSongId && (
                <SongDetailPanel
                  youtubeId={selectedSongId}
                  onBack={() => setSelectedSongId(null)}
                  onSongDeleted={() => {
                    fetchSongs();
                    fetchStats();
                  }}
                />
              )}

              {/* Users View */}
              {activeSection === "users" &&
                !selectedRoomId &&
                !selectedUserProfile && (
                  <div className="font-geneva-12">
                    {users.length === 0 && !isLoading ? (
                      <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                        <MagnifyingGlass
                          className="h-8 w-8 mb-2 opacity-50"
                          weight="bold"
                        />
                        <span className="text-[11px]">
                          {t("apps.admin.search.noResults")}
                        </span>
                      </div>
                    ) : (
                      <>
                        <Table>
                          <TableHeader>
                            <TableRow className="text-[10px] border-none font-normal">
                              <TableHead className="font-normal bg-gray-100/50 h-[28px]">
                                {t("apps.admin.tableHeaders.username")}
                              </TableHead>
                              <TableHead className="font-normal bg-gray-100/50 h-[28px]">
                                {t("apps.admin.tableHeaders.status")}
                              </TableHead>
                              <TableHead className="font-normal bg-gray-100/50 h-[28px] whitespace-nowrap">
                                {t("apps.admin.tableHeaders.lastActive")}
                              </TableHead>
                              <TableHead className="font-normal bg-gray-100/50 h-[28px] w-8"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody className="text-[11px]">
                            {users.slice(0, visibleUsersCount).map((user) => (
                              <TableRow
                                key={user.username}
                                className={cn(
                                  "border-none hover:bg-gray-100/50 transition-colors cursor-pointer odd:bg-gray-200/50 group",
                                  user.banned && "bg-red-50/50 odd:bg-red-50/70"
                                )}
                                onClick={() =>
                                  setSelectedUserProfile(user.username)
                                }
                              >
                                <TableCell className="flex items-center gap-2">
                                  <div
                                    className={cn(
                                      "w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-medium",
                                      user.banned
                                        ? "bg-red-200 text-red-700"
                                        : "bg-neutral-200 text-neutral-600"
                                    )}
                                  >
                                    {user.username[0].toUpperCase()}
                                  </div>
                                  {user.username}
                                </TableCell>
                                <TableCell>
                                  {user.banned ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] bg-red-100 text-red-700 rounded">
                                      <Prohibit
                                        className="h-2.5 w-2.5"
                                        weight="bold"
                                      />
                                      {t("apps.admin.user.banned")}
                                    </span>
                                  ) : user.username.toLowerCase() === "ryo" ? (
                                    <span className="px-1.5 py-0.5 text-[9px] bg-blue-100 text-blue-700 rounded">
                                      {t("apps.admin.user.admin")}
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 text-[9px] bg-green-100 text-green-700 rounded">
                                      {t("apps.admin.user.active")}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="whitespace-nowrap">
                                  {formatRelativeTime(user.lastActive)}
                                </TableCell>
                                <TableCell>
                                  {user.username !== "ryo" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        promptDelete(
                                          "user",
                                          user.username,
                                          user.username
                                        );
                                      }}
                                      className="h-5 w-5 p-0 md:opacity-0 md:group-hover:opacity-100 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100"
                                    >
                                      <Trash size={14} weight="bold" />
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        {users.length > visibleUsersCount && (
                          <div className="pt-2 pb-1 flex justify-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setVisibleUsersCount(
                                  (prev) => prev + USERS_PER_PAGE
                                )
                              }
                              className="h-7 text-[11px] text-neutral-500 hover:text-neutral-700"
                            >
                              {t("apps.admin.loadMore", {
                                remaining: users.length - visibleUsersCount,
                              })}
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

              {/* Songs View */}
              {activeSection === "songs" &&
                !selectedRoomId &&
                !selectedUserProfile &&
                !selectedSongId && (
                  <div className="font-geneva-12">
                    {songs.length === 0 && !isLoading ? (
                      <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                        <MusicNote
                          className="h-8 w-8 mb-2 opacity-50"
                          weight="bold"
                        />
                        <span className="text-[11px]">
                          {t("apps.admin.songs.noSongs", "No songs in cache")}
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="divide-y divide-gray-200">
                          {songs
                            .filter(
                              (song) =>
                                songSearch.length === 0 ||
                                song.title
                                  .toLowerCase()
                                  .includes(songSearch.toLowerCase()) ||
                                (song.artist
                                  ?.toLowerCase()
                                  .includes(songSearch.toLowerCase()) ??
                                  false)
                            )
                            .slice(0, visibleSongsCount)
                            .map((song) => (
                              <div
                                key={song.youtubeId}
                                className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100/50 transition-colors cursor-pointer group"
                                onClick={() =>
                                  setSelectedSongId(song.youtubeId)
                                }
                              >
                                {/* Cover Image */}
                                <div className="w-10 h-10 flex-shrink-0 rounded overflow-hidden bg-gray-200">
                                  <img
                                    src={
                                      formatKugouImageUrl(song.cover, 100) ||
                                      `https://i.ytimg.com/vi/${song.youtubeId}/default.jpg`
                                    }
                                    alt={song.title}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                  />
                                </div>
                                {/* Title and Artist */}
                                <div className="flex-1 min-w-0">
                                  <div
                                    className="text-[12px] font-medium truncate"
                                    title={song.title}
                                  >
                                    {song.title}
                                  </div>
                                  <div
                                    className="text-[11px] text-neutral-500 truncate"
                                    title={song.artist}
                                  >
                                    {song.artist || "-"}
                                  </div>
                                </div>
                                {/* Created By */}
                                {song.createdBy && (
                                  <span className="text-[10px] text-neutral-400 flex-shrink-0">
                                    {song.createdBy}
                                  </span>
                                )}
                                {/* Delete Button */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    promptDelete(
                                      "song",
                                      song.youtubeId,
                                      song.title
                                    );
                                  }}
                                  className="h-6 w-6 p-0 flex-shrink-0 md:opacity-0 md:group-hover:opacity-100 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100"
                                >
                                  <Trash size={14} weight="bold" />
                                </Button>
                              </div>
                            ))}
                        </div>
                        {songs.filter(
                          (song) =>
                            songSearch.length === 0 ||
                            song.title
                              .toLowerCase()
                              .includes(songSearch.toLowerCase()) ||
                            (song.artist
                              ?.toLowerCase()
                              .includes(songSearch.toLowerCase()) ??
                              false)
                        ).length > visibleSongsCount && (
                          <div className="pt-2 pb-1 flex justify-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setVisibleSongsCount(
                                  (prev) => prev + SONGS_PER_PAGE
                                )
                              }
                              className="h-7 text-[11px] text-neutral-500 hover:text-neutral-700"
                            >
                              {t("apps.admin.loadMore", {
                                remaining:
                                  songs.filter(
                                    (song) =>
                                      songSearch.length === 0 ||
                                      song.title
                                        .toLowerCase()
                                        .includes(songSearch.toLowerCase()) ||
                                      (song.artist
                                        ?.toLowerCase()
                                        .includes(songSearch.toLowerCase()) ??
                                        false)
                                  ).length - visibleSongsCount,
                              })}
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

              {/* Room Messages View */}
              {selectedRoomId && !selectedUserProfile && (
                <div className="font-geneva-12">
                  {roomMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                      <span className="text-[11px]">
                        {t("apps.admin.room.noMessages")}
                      </span>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="text-[10px] border-none font-normal">
                          <TableHead className="font-normal bg-gray-100/50 h-[28px]">
                            {t("apps.admin.tableHeaders.user")}
                          </TableHead>
                          <TableHead className="font-normal bg-gray-100/50 h-[28px]">
                            {t("apps.admin.tableHeaders.message")}
                          </TableHead>
                          <TableHead className="font-normal bg-gray-100/50 h-[28px] whitespace-nowrap">
                            {t("apps.admin.tableHeaders.time")}
                          </TableHead>
                          <TableHead className="font-normal bg-gray-100/50 h-[28px] w-8"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="text-[11px]">
                        {roomMessages.map((message) => (
                          <TableRow
                            key={message.id}
                            className="border-none hover:bg-gray-100/50 transition-colors cursor-default odd:bg-gray-200/50 group"
                          >
                            <TableCell className="flex items-center gap-2 whitespace-nowrap">
                              <div className="w-4 h-4 rounded-full bg-neutral-200 flex items-center justify-center text-[9px] font-medium text-neutral-600">
                                {message.username[0].toUpperCase()}
                              </div>
                              {message.username}
                            </TableCell>
                            <TableCell className="max-w-[200px]">
                              <span className="truncate block">
                                {message.content}
                              </span>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {formatRelativeTime(message.timestamp)}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (selectedRoomId) {
                                    deleteMessage(selectedRoomId, message.id);
                                  }
                                }}
                                className="h-5 w-5 p-0 md:opacity-0 md:group-hover:opacity-100 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100"
                              >
                                <Trash size={14} weight="bold" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              )}
            </ScrollArea>

            {/* Status Bar */}
            <div className="os-status-bar os-status-bar-text flex items-center justify-between px-2 py-1 text-[10px] font-geneva-12 bg-gray-100 border-t border-gray-300">
              <span>
                {activeSection === "users" && !selectedRoomId
                  ? t("apps.admin.statusBar.usersCount", {
                      count: users.length,
                    })
                  : activeSection === "songs" && !selectedRoomId
                  ? t("apps.admin.statusBar.songsCount", {
                      count: songs.length,
                      defaultValue: `${songs.length} songs`,
                    })
                  : selectedRoomId
                  ? t("apps.admin.statusBar.messagesCount", {
                      count: roomMessages.length,
                    })
                  : t("apps.admin.statusBar.roomsCount", {
                      count: rooms.length,
                    })}
              </span>
              <span>
                {t("apps.admin.statusBar.loggedInAs", { username })}
              </span>
            </div>
          </div>
        </div>

        <HelpDialog
          isOpen={isHelpDialogOpen}
          onOpenChange={setIsHelpDialogOpen}
          helpItems={translatedHelpItems}
          appId="admin"
        />
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setIsAboutDialogOpen}
          metadata={appMetadata}
          appId="admin"
        />
        <ConfirmDialog
          isOpen={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          onConfirm={handleDeleteConfirm}
          title={t("apps.admin.dialogs.deleteTitle", {
            type:
              deleteTarget?.type === "allSongs"
                ? t("apps.admin.songs.allSongs", "all songs")
                : deleteTarget?.type === "song"
                ? t("common.dialog.share.itemTypes.song")
                : deleteTarget?.type === "user"
                ? t("apps.admin.user.user")
                : deleteTarget?.type === "room"
                ? t("apps.admin.profile.room")
                : deleteTarget?.type === "message"
                ? t("apps.admin.tableHeaders.message")
                : deleteTarget?.type,
          })}
          description={t("apps.admin.dialogs.deleteDescription", {
            type:
              deleteTarget?.type === "allSongs"
                ? t("apps.admin.songs.allSongs", "all songs")
                : deleteTarget?.type === "song"
                ? t("common.dialog.share.itemTypes.song")
                : deleteTarget?.type === "user"
                ? t("apps.admin.user.user")
                : deleteTarget?.type === "room"
                ? t("apps.admin.profile.room")
                : deleteTarget?.type === "message"
                ? t("apps.admin.tableHeaders.message")
                : deleteTarget?.type,
            name: deleteTarget?.name,
          })}
        />
      </WindowFrame>
    </>
  );
}
