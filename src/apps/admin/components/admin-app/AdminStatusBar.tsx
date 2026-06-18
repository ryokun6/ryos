import { useTranslation } from "react-i18next";
import { useAdminDashboardStore } from "@/stores/useAdminDashboardStore";
import type { AdminSection } from "../../utils/navigationState";
import type { TFunction } from "i18next";

interface RoomLite {
  id: string;
}

type RangeFormatter = Intl.DateTimeFormat & {
  formatRange?: (start: Date, end: Date) => string;
};

/**
 * Localized date (Today) or date range (7d/14d/30d) covered by the dashboard
 * analytics, anchored on the current day. Mirrors the range the panel fetches:
 * the last `rangeDays` days inclusive of today.
 */
function formatDashboardRange(rangeDays: number, locale: string): string {
  const end = new Date();
  const fmt = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }) as RangeFormatter;

  if (rangeDays <= 1) return fmt.format(end);

  const start = new Date(end);
  start.setDate(end.getDate() - (rangeDays - 1));

  if (typeof fmt.formatRange === "function") {
    try {
      return fmt.formatRange(start, end);
    } catch {
      // fall through to manual join below
    }
  }
  return `${fmt.format(start)} \u2013 ${fmt.format(end)}`;
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
  const { i18n } = useTranslation();
  const dashboardRangeDays = useAdminDashboardStore((s) => s.rangeDays);
  const redisKeyCount = useAdminDashboardStore((s) => s.redisKeyCount);
  const locale = i18n.resolvedLanguage || i18n.language || "en";

  return (
    <div className="os-status-bar os-status-bar-text flex items-center justify-between px-2 py-1 text-[10px] font-geneva-12">
      <span>
        {activeSection === "dashboard"
          ? formatDashboardRange(dashboardRangeDays, locale)
          : activeSection === "cursorAgents"
            ? t("apps.admin.statusBar.cursorAgentsCount", {
                count: stats.totalCursorAgents ?? 0,
                defaultValue: `${stats.totalCursorAgents ?? 0} Cursor agents`,
              })
            : activeSection === "redis"
              ? t("apps.admin.statusBar.redisKeysCount", {
                  count: redisKeyCount ?? 0,
                })
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
