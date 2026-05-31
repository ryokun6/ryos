import {
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  MENUBAR_ITEM_CLASS,
  MENUBAR_SEPARATOR_CLASS,
  MENUBAR_TRIGGER_CLASS,
} from "@/components/shared/menubar/menubarStyles";
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
      {/* File Menu */}
      <MenubarMenu>
        <MenubarTrigger className={MENUBAR_TRIGGER_CLASS}>
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem onClick={onRefresh} className={MENUBAR_ITEM_CLASS}>
            {t("apps.admin.menu.refreshData")}
          </MenubarItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem onClick={onClose} className={MENUBAR_ITEM_CLASS}>
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* View Menu */}
      <MenubarMenu>
        <MenubarTrigger className={MENUBAR_TRIGGER_CLASS}>
          {t("common.menu.view")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          {/* Section Selection */}
          <MenubarCheckboxItem
            checked={activeSection === "dashboard"}
            onCheckedChange={(checked) => {
              if (checked) onSectionChange("dashboard");
            }}
            className={MENUBAR_ITEM_CLASS}
          >
            {t("apps.admin.sidebar.dashboard", "Dashboard")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={activeSection === "users"}
            onCheckedChange={(checked) => {
              if (checked) onSectionChange("users");
            }}
            className={MENUBAR_ITEM_CLASS}
          >
            {t("apps.admin.sidebar.users")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={activeSection === "songs"}
            onCheckedChange={(checked) => {
              if (checked) onSectionChange("songs");
            }}
            className={MENUBAR_ITEM_CLASS}
          >
            {t("apps.admin.sidebar.songs")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={activeSection === "cursorAgents"}
            onCheckedChange={(checked) => {
              if (checked) onSectionChange("cursorAgents");
            }}
            className={MENUBAR_ITEM_CLASS}
          >
            {t("apps.admin.sidebar.cursorAgents", "Cursor Agents")}
          </MenubarCheckboxItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarCheckboxItem
            checked={activeSection === "rooms"}
            onCheckedChange={(checked) => {
              if (checked) onSectionChange("rooms");
            }}
            className={MENUBAR_ITEM_CLASS}
          >
            {t("apps.admin.sidebar.rooms")}
          </MenubarCheckboxItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          {/* Sidebar Toggle */}
          <MenubarCheckboxItem
            checked={isSidebarVisible}
            onCheckedChange={(checked) => {
              if (checked !== isSidebarVisible) onToggleSidebar();
            }}
            className={MENUBAR_ITEM_CLASS}
          >
            {t("apps.admin.menu.showSidebar")}
          </MenubarCheckboxItem>
        </MenubarContent>
      </MenubarMenu>
    </AppMenuBarShell>
  );
}
