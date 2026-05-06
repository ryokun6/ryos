import React from "react";
import { CaretRight } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useSound, Sounds } from "@/hooks/useSound";
import { useThemeStore } from "@/stores/useThemeStore";
import { isWindowsTheme } from "@/themes";
import { SelectableListItem } from "@/components/ui/selectable-list-item";
import { useTranslation } from "react-i18next";
import type { AdminSection } from "../utils/navigationState";

interface Room {
  id: string;
  name: string;
  type: "public" | "private" | "irc";
  userCount: number;
}

interface AdminSidebarProps {
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
  rooms: Room[];
  selectedRoomId: string | null;
  onRoomSelect: (roomId: string | null) => void;
  isRoomsExpanded: boolean;
  onToggleRoomsExpanded: () => void;
  stats: {
    totalUsers: number;
    totalRooms: number;
    totalMessages: number;
    totalSongs?: number;
    totalCursorAgents?: number;
  };
  isVisible: boolean;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  activeSection,
  onSectionChange,
  rooms,
  selectedRoomId,
  onRoomSelect,
  isRoomsExpanded,
  onToggleRoomsExpanded,
  stats,
  isVisible,
}) => {
  const { t } = useTranslation();
  const { play: playButtonClick } = useSound(Sounds.BUTTON_CLICK);
  const currentTheme = useThemeStore((state) => state.current);
  const isWindowsLegacyTheme = isWindowsTheme(currentTheme);

  const publicRooms = rooms.filter((r) => r.type !== "private");

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex flex-col font-geneva-12 text-[12px] bg-neutral-100 w-56 border-r h-full overflow-hidden",
        isWindowsLegacyTheme
          ? "border-[#919b9c]"
          : currentTheme === "macosx"
          ? "border-black/10"
          : "border-black"
      )}
    >
      <div className="pt-3 flex flex-col flex-1 overflow-hidden">
        <div className="flex justify-between items-center mb-2 flex-shrink-0 px-3">
          <h2 className="text-[14px] pl-1">{t("apps.admin.title")}</h2>
        </div>

        <div
          className="space-y-1 flex-1 overflow-y-auto min-h-0"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <SelectableListItem
            isSelected={activeSection === "dashboard"}
            onClick={() => { playButtonClick(); onSectionChange("dashboard"); onRoomSelect(null); }}
          >
            {t("apps.admin.sidebar.dashboard", "Dashboard")}
          </SelectableListItem>

          <SelectableListItem
            isSelected={activeSection === "analytics"}
            onClick={() => { playButtonClick(); onSectionChange("analytics"); onRoomSelect(null); }}
          >
            {t("apps.admin.sidebar.analytics", "Analytics")}
          </SelectableListItem>

          <SelectableListItem
            isSelected={activeSection === "users" && selectedRoomId === null}
            onClick={() => { playButtonClick(); onSectionChange("users"); onRoomSelect(null); }}
          >
            <div className="flex items-center">
              <span>{t("apps.admin.sidebar.users")}</span>
              <span className={cn("text-[10px] ml-1.5", activeSection === "users" && selectedRoomId === null ? "text-white/40" : "text-black/40")}>
                {stats.totalUsers}
              </span>
            </div>
          </SelectableListItem>

          <SelectableListItem
            isSelected={activeSection === "songs" && selectedRoomId === null}
            onClick={() => { playButtonClick(); onSectionChange("songs"); onRoomSelect(null); }}
          >
            <div className="flex items-center">
              <span>{t("apps.admin.sidebar.songs", "Songs")}</span>
              <span className={cn("text-[10px] ml-1.5", activeSection === "songs" && selectedRoomId === null ? "text-white/40" : "text-black/40")}>
                {stats.totalSongs ?? 0}
              </span>
            </div>
          </SelectableListItem>

          <SelectableListItem
            isSelected={activeSection === "cursorAgents"}
            onClick={() => { playButtonClick(); onSectionChange("cursorAgents"); onRoomSelect(null); }}
          >
            <div className="flex items-center">
              <span>{t("apps.admin.sidebar.cursorAgents", "Cursor Agents")}</span>
              <span
                className={cn(
                  "ml-1.5 text-[10px]",
                  activeSection === "cursorAgents"
                    ? "text-white/40"
                    : "text-black/40"
                )}
              >
                {stats.totalCursorAgents ?? 0}
              </span>
            </div>
          </SelectableListItem>

          {/* Rooms Section Header */}
          <div
            className={cn(
              "mt-2 px-4 pt-2 pb-1 w-full flex items-center group cursor-pointer",
              "!text-[11px] uppercase tracking-wide text-black/50"
            )}
            onClick={() => {
              playButtonClick();
              onToggleRoomsExpanded();
            }}
          >
            <span>{t("apps.admin.sidebar.rooms")}</span>
            <span className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <CaretRight
                className={cn(
                  "w-2.5 h-2.5 text-black/50 transition-transform",
                  isRoomsExpanded ? "rotate-90" : "rotate-0"
                )}
              />
            </span>
          </div>

          {/* Rooms List */}
          {isRoomsExpanded && (
            <>
              {publicRooms.length > 0 && (
                <>
                  {publicRooms.map((room) => (
                    <SelectableListItem
                      key={room.id}
                      isSelected={selectedRoomId === room.id}
                      className="group relative"
                      onClick={() => { playButtonClick(); onSectionChange("rooms"); onRoomSelect(room.id); }}
                    >
                      <div className="flex items-center">
                        <span>#{room.name}</span>
                        <span
                          className={cn(
                            "text-[10px] ml-1.5 transition-opacity",
                            selectedRoomId === room.id ? "text-white/40" : "text-black/40",
                            room.userCount > 0 ? "opacity-100" : selectedRoomId === room.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                          )}
                        >
                          {room.userCount} {t("apps.admin.sidebar.online")}
                        </span>
                      </div>
                    </SelectableListItem>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
