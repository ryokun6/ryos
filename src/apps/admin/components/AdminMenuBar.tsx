import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  AppMenuBarMenus,
  type MenuDescriptor,
} from "@/components/shared/menubar/AppMenuBarMenus";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { useTranslation } from "react-i18next";
import type { AdminSection } from "../utils/navigationState";

interface AdminMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onRefresh: () => void;
  onToggleSidebar: () => void;
  isSidebarVisible: boolean;
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
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
        { type: "action", label: t("common.menu.close"), onClick: onClose },
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
        sectionCheckbox(
          "cursorAgents",
          t("apps.admin.sidebar.cursorAgents", "Cursor Agents")
        ),
        { type: "separator" },
        sectionCheckbox("rooms", t("apps.admin.sidebar.rooms")),
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
