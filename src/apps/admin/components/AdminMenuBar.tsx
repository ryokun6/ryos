import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  AppMenuBarMenus,
  type MenuDescriptor,
} from "@/components/shared/menubar/AppMenuBarMenus";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { useTranslation } from "react-i18next";
import type { AdminSection } from "../utils/navigationState";

interface AdminMenuBarRoom {
  id: string;
  name: string;
  type: "public" | "private" | "irc";
  userCount: number;
}

interface AdminMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onRefresh: () => void;
  onToggleSidebar: () => void;
  isSidebarVisible: boolean;
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
  rooms: AdminMenuBarRoom[];
  selectedRoomId: string | null;
  onRoomSelect: (roomId: string | null) => void;
}

export function AdminMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  onRefresh,
  onToggleSidebar,
  isSidebarVisible,
  activeSection,
  onSectionChange,
  rooms,
  selectedRoomId,
  onRoomSelect,
}: AdminMenuBarProps) {
  const { t } = useTranslation();
  const {
    isShareDialogOpen,
    setIsShareDialogOpen,
    isXpTheme,
    isMacOsxTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("admin");

  const sectionCheckbox = (section: AdminSection, label: string) =>
    ({
      type: "checkbox",
      label,
      checked: activeSection === section,
      onChange: (checked: boolean) => {
        if (checked) onSectionChange(section);
      },
    } as const);

  const publicRooms = rooms.filter((r) => r.type !== "private");

  const roomItems: MenuDescriptor["items"] = publicRooms.map((room) => ({
    type: "checkbox",
    label: `#${room.name}`,
    checked: activeSection === "rooms" && selectedRoomId === room.id,
    onChange: (checked) => {
      if (checked) {
        onSectionChange("rooms");
        onRoomSelect(room.id);
      }
    },
  }));

  const menus: MenuDescriptor[] = [
    {
      label: t("common.menu.file"),
      items: [
        {
          type: "action",
          label: t("apps.admin.menu.refreshData"),
          onClick: onRefresh,
        },
        { type: "separator" },
        {
          type: "action",
          label: t("common.menu.close"),
          onClick: onClose,
          shortcutId: "close",
        },
      ],
    },
    {
      label: t("common.menu.view"),
      items: [
        sectionCheckbox(
          "dashboard",
          t("apps.admin.sidebar.dashboard", "Dashboard")
        ),
        sectionCheckbox("users", t("apps.admin.sidebar.users")),
        sectionCheckbox("songs", t("apps.admin.sidebar.songs")),
        sectionCheckbox("redis", t("apps.admin.sidebar.redis", "Redis")),
        sectionCheckbox(
          "cursorAgents",
          t("apps.admin.sidebar.cursorAgents", "Cursor Agents")
        ),
        ...(roomItems.length > 0
          ? ([{ type: "separator" }, ...roomItems] as MenuDescriptor["items"])
          : []),
        { type: "separator" },
        {
          type: "checkbox",
          label: t("apps.admin.menu.showSidebar"),
          checked: isSidebarVisible,
          onChange: (checked) => {
            if (checked !== isSidebarVisible) onToggleSidebar();
          },
        },
      ],
    },
  ];

  return (
    <AppMenuBarShell
      isXpTheme={isXpTheme}
      isMacOsxTheme={isMacOsxTheme}
      appId={appId}
      appName={appName}
      isShareDialogOpen={isShareDialogOpen}
      setIsShareDialogOpen={setIsShareDialogOpen}
      helpItemLabel={t("apps.admin.menu.adminHelp")}
      aboutItemLabel={t("apps.admin.menu.aboutAdmin")}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
    >
      <AppMenuBarMenus menus={menus} />
    </AppMenuBarShell>
  );
}
