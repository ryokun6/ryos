import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from "react";
import { AdminSidebar } from "../AdminSidebar";
import { CursorAgentsPanel } from "../CursorAgentsPanel";
import { AdminAuditLogPanel } from "../AdminAuditLogPanel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { adminMainPaneClass } from "../../utils/adminStyles";
import { AdminToolbar } from "./AdminToolbar";
import { AdminImportStatusBar } from "./AdminImportStatusBar";
import { AdminScrollContent } from "./AdminScrollContent";
import { AdminStatusBar } from "./AdminStatusBar";
import { AdminRedisBrowserView } from "./AdminRedisBrowserView";
import type { AdminSection } from "../../utils/navigationState";
import type { TFunction } from "i18next";
import type { CachedSongMetadata } from "@/utils/songMetadataCache";
import type { AdminImportStatus } from "./adminImportStatus";

interface RoomLite {
  id: string;
  name: string;
  type: "public" | "private" | "irc";
  createdAt: number;
  userCount: number;
}

interface MessageRow {
  id: string;
  roomId: string;
  username: string;
  content: string;
  timestamp: number;
}

interface UserRow {
  username: string;
  lastActive: number;
  banned?: boolean;
}

interface StatsLite {
  totalUsers: number;
  totalRooms: number;
  totalMessages: number;
  totalSongs?: number;
  totalCursorAgents?: number;
}

export interface AdminMainPaneProps {
  containerRef: RefObject<HTMLDivElement | null>;
  scrollAreaRef: RefObject<HTMLDivElement | null>;
  activeSection: AdminSection;
  setActiveSection: (s: AdminSection) => void;
  rooms: RoomLite[];
  selectedRoomId: string | null;
  setSelectedRoomId: (id: string | null) => void;
  isRoomsExpanded: boolean;
  setIsRoomsExpanded: Dispatch<SetStateAction<boolean>>;
  stats: StatsLite;
  isSidebarVisible: boolean;
  selectedUserProfile: string | null;
  selectedSongId: string | null;
  currentTheme: string;
  isWindowsTheme: boolean;
  t: TFunction;
  userSearch: string;
  setUserSearch: (v: string) => void;
  songSearch: string;
  setSongSearch: (v: string) => void;
  songsFilterByRyoOnly: boolean;
  setSongsFilterByRyoOnly: Dispatch<SetStateAction<boolean>>;
  songs: CachedSongMetadata[];
  isImporting: boolean;
  isExporting: boolean;
  isDeletingAll: boolean;
  importStatus: AdminImportStatus;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleImportFile: (e: ChangeEvent<HTMLInputElement>) => void;
  handleExportLibrary: () => void;
  handleDeleteAllSongs: () => void;
  handleRefresh: () => void;
  isLoading: boolean;
  promptDelete: (
    type: "user" | "room" | "message" | "song",
    id: string,
    name: string,
  ) => void;
  roomMessages: MessageRow[];
  selectedRoom: RoomLite | null;
  shouldShowImportStatus: boolean;
  isMacOSTheme: boolean;
  importProgressPercent: number;
  importStatusText: string;
  showCursorAgentsPanel: boolean;
  cursorAgentsRefreshSignal: number;
  setCursorAgentCount: (n: number) => void;
  users: UserRow[];
  visibleUsersCount: number;
  setVisibleUsersCount: Dispatch<SetStateAction<number>>;
  USERS_PER_PAGE: number;
  filteredSongs: CachedSongMetadata[];
  visibleSongsCount: number;
  setVisibleSongsCount: Dispatch<SetStateAction<number>>;
  SONGS_PER_PAGE: number;
  setSelectedUserProfile: (u: string | null) => void;
  setSelectedSongId: (id: string | null) => void;
  fetchUsers: (userSearch: string) => void;
  fetchStats: () => void;
  fetchSongs: () => void;
  formatRelativeTime: (ts: number) => string;
  formatKugouImageUrl: (
    imgUrl: string | undefined,
    size?: number,
  ) => string | null;
  deleteMessage: (roomId: string, messageId: string) => void;
  username: string | null | undefined;
}

export function AdminMainPane({
  containerRef,
  scrollAreaRef,
  activeSection,
  setActiveSection,
  rooms,
  selectedRoomId,
  setSelectedRoomId,
  isRoomsExpanded,
  setIsRoomsExpanded,
  stats,
  isSidebarVisible,
  selectedUserProfile,
  selectedSongId,
  currentTheme,
  isWindowsTheme,
  t,
  userSearch,
  setUserSearch,
  songSearch,
  setSongSearch,
  songsFilterByRyoOnly,
  setSongsFilterByRyoOnly,
  songs,
  isImporting,
  isExporting,
  isDeletingAll,
  importStatus,
  fileInputRef,
  handleImportFile,
  handleExportLibrary,
  handleDeleteAllSongs,
  handleRefresh,
  isLoading,
  promptDelete,
  roomMessages,
  selectedRoom,
  shouldShowImportStatus,
  isMacOSTheme,
  importProgressPercent,
  importStatusText,
  showCursorAgentsPanel,
  cursorAgentsRefreshSignal,
  setCursorAgentCount,
  users,
  visibleUsersCount,
  setVisibleUsersCount,
  USERS_PER_PAGE,
  filteredSongs,
  visibleSongsCount,
  setVisibleSongsCount,
  SONGS_PER_PAGE,
  setSelectedUserProfile,
  setSelectedSongId,
  fetchUsers,
  fetchStats,
  fetchSongs,
  formatRelativeTime,
  formatKugouImageUrl,
  deleteMessage,
  username,
}: AdminMainPaneProps) {
  const showRedisPanel =
    activeSection === "redis" &&
    !selectedRoomId &&
    !selectedUserProfile &&
    !selectedSongId;

  const showAuditLogPanel =
    activeSection === "auditLog" &&
    !selectedRoomId &&
    !selectedUserProfile &&
    !selectedSongId;

  return (
    <div ref={containerRef} className="flex size-full admin-force-font">
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

      <div className={cn("flex min-w-0 flex-1 flex-col overflow-hidden", adminMainPaneClass)}>
        {!selectedUserProfile &&
          !selectedSongId &&
          activeSection !== "dashboard" &&
          activeSection !== "cursorAgents" &&
          activeSection !== "redis" &&
          activeSection !== "auditLog" && (
            <AdminToolbar
              t={t}
              currentTheme={currentTheme}
              isWindowsTheme={isWindowsTheme}
              activeSection={activeSection}
              selectedRoomId={selectedRoomId}
              selectedRoom={selectedRoom}
              roomMessages={roomMessages}
              userSearch={userSearch}
              setUserSearch={setUserSearch}
              songSearch={songSearch}
              setSongSearch={setSongSearch}
              songsFilterByRyoOnly={songsFilterByRyoOnly}
              setSongsFilterByRyoOnly={setSongsFilterByRyoOnly}
              songs={songs}
              isImporting={isImporting}
              isExporting={isExporting}
              isDeletingAll={isDeletingAll}
              importStatus={importStatus}
              fileInputRef={fileInputRef}
              handleImportFile={handleImportFile}
              handleExportLibrary={handleExportLibrary}
              handleDeleteAllSongs={handleDeleteAllSongs}
              handleRefresh={handleRefresh}
              isLoading={isLoading}
              promptDelete={promptDelete}
            />
          )}

        <AdminImportStatusBar
          shouldShowImportStatus={shouldShowImportStatus}
          isMacOSTheme={isMacOSTheme}
          importProgressPercent={importProgressPercent}
          importStatusText={importStatusText}
          importStatus={importStatus}
        />

        {showCursorAgentsPanel ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <CursorAgentsPanel
              refreshSignal={cursorAgentsRefreshSignal}
              onTotalCountChange={setCursorAgentCount}
            />
          </div>
        ) : null}

        {showRedisPanel ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <AdminRedisBrowserView t={t} />
          </div>
        ) : null}

        {showAuditLogPanel ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <AdminAuditLogPanel />
          </div>
        ) : null}

        <ScrollArea
          ref={scrollAreaRef}
          className={cn(
            "min-h-0 min-w-0 flex-1",
            (showCursorAgentsPanel || showRedisPanel || showAuditLogPanel) &&
              "hidden",
          )}
        >
          <AdminScrollContent
            t={t}
            activeSection={activeSection}
            selectedRoomId={selectedRoomId}
            selectedUserProfile={selectedUserProfile}
            selectedSongId={selectedSongId}
            handleRefresh={handleRefresh}
            setSelectedUserProfile={setSelectedUserProfile}
            fetchUsers={fetchUsers}
            fetchStats={fetchStats}
            userSearch={userSearch}
            setSelectedSongId={setSelectedSongId}
            fetchSongs={fetchSongs}
            users={users}
            isLoading={isLoading}
            visibleUsersCount={visibleUsersCount}
            setVisibleUsersCount={setVisibleUsersCount}
            USERS_PER_PAGE={USERS_PER_PAGE}
            songs={songs}
            filteredSongs={filteredSongs}
            visibleSongsCount={visibleSongsCount}
            setVisibleSongsCount={setVisibleSongsCount}
            SONGS_PER_PAGE={SONGS_PER_PAGE}
            roomMessages={roomMessages}
            formatRelativeTime={formatRelativeTime}
            formatKugouImageUrl={formatKugouImageUrl}
            promptDelete={promptDelete}
            deleteMessage={deleteMessage}
          />
        </ScrollArea>

        <AdminStatusBar
          t={t}
          activeSection={activeSection}
          selectedRoomId={selectedRoomId}
          stats={stats}
          users={users}
          filteredSongs={filteredSongs}
          roomMessages={roomMessages}
          rooms={rooms}
          username={username}
        />
      </div>
    </div>
  );
}
