import React from "react";
import { CaretRight, Hash } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useSound, Sounds } from "@/hooks/useSound";
import { useThemeStore } from "@/stores/useThemeStore";
import { useTranslation } from "react-i18next";

type AdminSection = "users" | "rooms" | "songs";

interface Room {
  id: string;
  name: string;
  type: "public" | "private";
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
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98" || currentTheme === "win7";
  const isWindowsLegacyTheme = isXpTheme;

  const publicRooms = rooms.filter((r) => r.type !== "private");

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex flex-col font-geneva-12 text-[11px] bg-gray-100 w-48 border-r h-full overflow-hidden",
        isWindowsLegacyTheme
          ? "border-[#919b9c]"
          : currentTheme === "macosx"
          ? "border-black/10"
          : "border-gray-300"
      )}
    >
      <div className="pt-3 flex flex-col flex-1 overflow-hidden">
        <div className="flex justify-between items-center mb-2 flex-shrink-0 px-3">
          <h2 className="text-[14px] pl-1">{t("apps.admin.title")}</h2>
        </div>

        <div
          className="space-y-0.5 flex-1 overflow-y-auto min-h-0"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {/* Songs Section */}
          <div
            className={cn(
              "py-1.5 px-5 flex items-center gap-2 cursor-pointer",
              activeSection === "songs" && selectedRoomId === null
                ? ""
                : "hover:bg-black/5"
            )}
            style={
              activeSection === "songs" && selectedRoomId === null
                ? {
                    background: "var(--os-color-selection-bg)",
                    color: "var(--os-color-selection-text)",
                  }
                : undefined
            }
            onClick={() => {
              playButtonClick();
              onSectionChange("songs");
              onRoomSelect(null);
            }}
          >
            <span>{t("apps.admin.sidebar.songs", "Songs")}</span>
            <span
              className={cn(
                "text-[10px] ml-auto",
                activeSection === "songs" && selectedRoomId === null
                  ? "text-white/60"
                  : "text-black/40"
              )}
            >
              {stats.totalSongs ?? 0}
            </span>
          </div>

          {/* Users Section */}
          <div
            className={cn(
              "py-1.5 px-5 flex items-center gap-2 cursor-pointer",
              activeSection === "users" && selectedRoomId === null
                ? ""
                : "hover:bg-black/5"
            )}
            style={
              activeSection === "users" && selectedRoomId === null
                ? {
                    background: "var(--os-color-selection-bg)",
                    color: "var(--os-color-selection-text)",
                  }
                : undefined
            }
            onClick={() => {
              playButtonClick();
              onSectionChange("users");
              onRoomSelect(null);
            }}
          >
            <span>{t("apps.admin.sidebar.users")}</span>
            <span
              className={cn(
                "text-[10px] ml-auto",
                activeSection === "users" && selectedRoomId === null
                  ? "text-white/60"
                  : "text-black/40"
              )}
            >
              {stats.totalUsers}
            </span>
          </div>

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
            <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
              <CaretRight
                className={cn(
                  "w-3 h-3 text-black/50 transition-transform",
                  isRoomsExpanded ? "rotate-90" : "rotate-0"
                )}
                weight="bold"
              />
            </span>
          </div>

          {/* Rooms List */}
          {isRoomsExpanded && (
            <>
              {publicRooms.length > 0 && (
                <>
                  {publicRooms.map((room) => (
                    <div
                      key={room.id}
                      className={cn(
                        "group relative py-1 px-5 flex items-center gap-1.5 cursor-pointer",
                        selectedRoomId === room.id ? "" : "hover:bg-black/5"
                      )}
                      style={
                        selectedRoomId === room.id
                          ? {
                              background: "var(--os-color-selection-bg)",
                              color: "var(--os-color-selection-text)",
                            }
                          : undefined
                      }
                      onClick={() => {
                        playButtonClick();
                        onSectionChange("rooms");
                        onRoomSelect(room.id);
                      }}
                    >
                      <Hash className="w-3 h-3 flex-shrink-0" weight="bold" />
                      <span className="truncate">{room.name}</span>
                      <span
                        className={cn(
                          "text-[10px] ml-auto",
                          selectedRoomId === room.id
                            ? "text-white/60"
                            : "text-black/40"
                        )}
                      >
                        {room.userCount} {t("apps.admin.sidebar.online")}
                      </span>
                    </div>
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
