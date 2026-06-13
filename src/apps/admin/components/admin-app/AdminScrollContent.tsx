import type { Dispatch, SetStateAction } from "react";
import { DashboardPanel } from "../DashboardPanel";
import { UserProfilePanel } from "../UserProfilePanel";
import { SongDetailPanel } from "../SongDetailPanel";
import { AdminUsersView } from "./AdminUsersView";
import { AdminSongsView } from "./AdminSongsView";
import { AdminRoomMessagesView } from "./AdminRoomMessagesView";
import type { AdminSection } from "../../utils/navigationState";
import type { TFunction } from "i18next";
import type { CachedSongMetadata } from "@/utils/songMetadataCache";

interface UserRow {
  username: string;
  lastActive: number;
  banned?: boolean;
}

interface MessageRow {
  id: string;
  roomId: string;
  username: string;
  content: string;
  timestamp: number;
}

export interface AdminScrollContentProps {
  t: TFunction;
  activeSection: AdminSection;
  selectedRoomId: string | null;
  selectedUserProfile: string | null;
  selectedSongId: string | null;
  handleRefresh: () => void;
  setSelectedUserProfile: (u: string | null) => void;
  fetchUsers: (userSearch: string) => void;
  fetchStats: () => void;
  userSearch: string;
  setSelectedSongId: (id: string | null) => void;
  fetchSongs: () => void;
  users: UserRow[];
  isLoading: boolean;
  visibleUsersCount: number;
  setVisibleUsersCount: Dispatch<SetStateAction<number>>;
  USERS_PER_PAGE: number;
  songs: CachedSongMetadata[];
  filteredSongs: CachedSongMetadata[];
  visibleSongsCount: number;
  setVisibleSongsCount: Dispatch<SetStateAction<number>>;
  SONGS_PER_PAGE: number;
  roomMessages: MessageRow[];
  formatRelativeTime: (ts: number) => string;
  formatKugouImageUrl: (
    imgUrl: string | undefined,
    size?: number,
  ) => string | null;
  promptDelete: (
    type: "user" | "room" | "message" | "song",
    id: string,
    name: string,
  ) => void;
  deleteMessage: (roomId: string, messageId: string) => void;
}

export function AdminScrollContent({
  t,
  activeSection,
  selectedRoomId,
  selectedUserProfile,
  selectedSongId,
  handleRefresh,
  setSelectedUserProfile,
  fetchUsers,
  fetchStats,
  userSearch,
  setSelectedSongId,
  fetchSongs,
  users,
  isLoading,
  visibleUsersCount,
  setVisibleUsersCount,
  USERS_PER_PAGE,
  songs,
  filteredSongs,
  visibleSongsCount,
  setVisibleSongsCount,
  SONGS_PER_PAGE,
  roomMessages,
  formatRelativeTime,
  formatKugouImageUrl,
  promptDelete,
  deleteMessage,
}: AdminScrollContentProps) {
  return (
    <>
      {activeSection === "dashboard" &&
        !selectedRoomId &&
        !selectedUserProfile &&
        !selectedSongId && <DashboardPanel onRefresh={handleRefresh} />}

      {selectedUserProfile && (
        <UserProfilePanel
          key={selectedUserProfile}
          username={selectedUserProfile}
          onBack={() => setSelectedUserProfile(null)}
          onUserDeleted={() => {
            fetchUsers(userSearch);
            fetchStats();
          }}
        />
      )}

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

      {activeSection === "users" &&
        !selectedRoomId &&
        !selectedUserProfile && (
          <AdminUsersView
            t={t}
            users={users}
            isLoading={isLoading}
            visibleUsersCount={visibleUsersCount}
            setVisibleUsersCount={setVisibleUsersCount}
            USERS_PER_PAGE={USERS_PER_PAGE}
            setSelectedUserProfile={setSelectedUserProfile}
            formatRelativeTime={formatRelativeTime}
            promptDelete={promptDelete}
          />
        )}

      {activeSection === "songs" &&
        !selectedRoomId &&
        !selectedUserProfile &&
        !selectedSongId && (
          <AdminSongsView
            t={t}
            songs={songs}
            filteredSongs={filteredSongs}
            isLoading={isLoading}
            visibleSongsCount={visibleSongsCount}
            setVisibleSongsCount={setVisibleSongsCount}
            SONGS_PER_PAGE={SONGS_PER_PAGE}
            setSelectedSongId={setSelectedSongId}
            formatKugouImageUrl={formatKugouImageUrl}
            promptDelete={promptDelete}
          />
        )}

      {selectedRoomId && !selectedUserProfile && (
        <AdminRoomMessagesView
          t={t}
          roomMessages={roomMessages}
          selectedRoomId={selectedRoomId}
          formatRelativeTime={formatRelativeTime}
          deleteMessage={deleteMessage}
        />
      )}
    </>
  );
}
