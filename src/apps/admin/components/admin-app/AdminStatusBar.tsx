import type { AdminSection } from "../../utils/navigationState";
import type { TFunction } from "i18next";

interface RoomLite {
  id: string;
}

interface StatsLite {
  totalCursorAgents?: number;
}

export interface AdminStatusBarProps {
  t: TFunction;
  activeSection: AdminSection;
  selectedRoomId: string | null;
  stats: StatsLite;
  users: { length: number };
  filteredSongs: { length: number };
  roomMessages: { length: number };
  rooms: RoomLite[];
  username: string | null | undefined;
}

export function AdminStatusBar({
  t,
  activeSection,
  selectedRoomId,
  stats,
  users,
  filteredSongs,
  roomMessages,
  rooms,
  username,
}: AdminStatusBarProps) {
  return (
    <div className="os-status-bar os-status-bar-text flex items-center justify-between px-2 py-1 text-[10px] font-geneva-12">
      <span>
        {activeSection === "dashboard"
          ? t("apps.admin.sidebar.dashboard", "Dashboard")
          : activeSection === "cursorAgents"
            ? t("apps.admin.statusBar.cursorAgentsCount", {
                count: stats.totalCursorAgents ?? 0,
                defaultValue: `${stats.totalCursorAgents ?? 0} Cursor agents`,
              })
            : activeSection === "redis"
              ? t("apps.admin.statusBar.redis", "Redis Browser")
            : activeSection === "users" && !selectedRoomId
              ? t("apps.admin.statusBar.usersCount", {
                  count: users.length,
                })
              : activeSection === "songs" && !selectedRoomId
                ? t("apps.admin.statusBar.songsCount", {
                    count: filteredSongs.length,
                    defaultValue: `${filteredSongs.length} songs`,
                  })
                : selectedRoomId
                  ? t("apps.admin.statusBar.messagesCount", {
                      count: roomMessages.length,
                    })
                  : t("apps.admin.statusBar.roomsCount", {
                      count: rooms.length,
                    })}
      </span>
      <span>{t("apps.admin.statusBar.loggedInAs", { username })}</span>
    </div>
  );
}
