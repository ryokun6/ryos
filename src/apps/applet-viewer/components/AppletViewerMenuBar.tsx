import { useMemo } from "react";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import { MENUBAR_SEPARATOR_CLASS } from "@/components/shared/menubar/menubarStyles";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import React from "react";
import { useAppStore } from "@/stores/useAppStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { useTranslation } from "react-i18next";

interface AppletViewerMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onExportAsApp: () => void;
  onExportAsHtml: () => void;
  onShareApplet: () => void;
  hasAppletContent: boolean;
  handleFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  instanceId?: string;
  onSetUsername?: () => void;
  onVerifyToken?: () => void;
  onLogout?: () => Promise<void>;
  updateCount?: number;
  onCheckForUpdates?: () => Promise<void>;
  onUpdateAll?: () => Promise<void>;
}

export function AppletViewerMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  onExportAsApp,
  onExportAsHtml,
  onShareApplet,
  hasAppletContent,
  handleFileSelect,
  instanceId,
  onSetUsername,
  onVerifyToken,
  onLogout,
  updateCount = 0,
  onCheckForUpdates,
  onUpdateAll,
}: AppletViewerMenuBarProps) {
  const { t } = useTranslation();
  const {
    isShareDialogOpen,
    setIsShareDialogOpen,
    isXpTheme,
    isMacOsxTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("applet-viewer");
  const launchApp = useLaunchApp();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const bringInstanceToForeground = useAppStore(
    (s) => s.bringInstanceToForeground
  );
  const instances = useAppStore((s) => s.instances);
  const appletInstances = useMemo(
    () =>
      Object.values(instances).filter(
        (inst) => inst.appId === "applet-viewer" && inst.isOpen
      ),
    [instances]
  );
  const username = useChatsStore((s) => s.username);
  const isAuthenticated = useChatsStore((s) => s.isAuthenticated);
  const isLoggedIn = !!(username && isAuthenticated);

  return (
    <AppMenuBarShell
      isXpTheme={isXpTheme}
      isMacOsxTheme={isMacOsxTheme}
      appId={appId}
      appName={appName}
      isShareDialogOpen={isShareDialogOpen}
      setIsShareDialogOpen={setIsShareDialogOpen}
      helpItemLabel={t("apps.applet-viewer.menu.appletsHelp")}
      aboutItemLabel={t("apps.applet-viewer.menu.aboutApplets")}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".html,.htm,.app,.gz"
        className="hidden"
      />
      {/* File Menu */}
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={() => launchApp("finder", { initialPath: "/Applets" })}
            className="text-md h-6 px-3"
          >
            {t("apps.applet-viewer.menu.open")}
          </MenubarItem>
          {hasAppletContent && isLoggedIn && (
            <MenubarItem
              onClick={onShareApplet}
              className="text-md h-6 px-3"
            >
              {t("apps.applet-viewer.menu.shareApplet")}
            </MenubarItem>
          )}
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem
            onClick={() => fileInputRef.current?.click()}
            className="text-md h-6 px-3"
          >
            {t("apps.applet-viewer.menu.importFromDevice")}
          </MenubarItem>
          {hasAppletContent && (
            <MenubarSub>
              <MenubarSubTrigger className="text-md h-6 px-3">
                {t("apps.applet-viewer.menu.exportAs")}
              </MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem
                  onClick={onExportAsApp}
                  className="text-md h-6 px-3"
                >
                  {t("apps.applet-viewer.menu.ryosApp")}
                </MenubarItem>
                <MenubarItem
                  onClick={onExportAsHtml}
                  className="text-md h-6 px-3"
                >
                  {t("apps.applet-viewer.menu.html")}
                </MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
          )}
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem
            onClick={onClose}
            className="text-md h-6 px-3"
          >
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Store Menu */}
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("apps.applet-viewer.menu.store")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={() => launchApp("applet-viewer", { 
              initialData: { path: "", content: "" } 
            })}
            className="text-md h-6 px-3"
          >
            {t("apps.applet-viewer.menu.openAppletStore")}
          </MenubarItem>
          <MenubarItem
            onClick={async () => {
              if (updateCount > 0 && onUpdateAll) {
                await onUpdateAll();
              } else if (onCheckForUpdates) {
                await onCheckForUpdates();
              }
            }}
            className="text-md h-6 px-3"
          >
            {updateCount > 0
              ? updateCount === 1
                ? t("apps.applet-viewer.menu.updateApplets", { count: updateCount })
                : t("apps.applet-viewer.menu.updateAppletsPlural", { count: updateCount })
              : t("apps.applet-viewer.menu.checkForUpdates")}
          </MenubarItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          {username && isAuthenticated ? (
            <MenubarItem
              onClick={() => onLogout?.()}
              className="text-md h-6 px-3"
            >
              {t("apps.applet-viewer.menu.logOut")}
            </MenubarItem>
          ) : (
            <>
              <MenubarItem
                onClick={onSetUsername}
                className="text-md h-6 px-3"
              >
                {t("apps.applet-viewer.menu.createAccount")}
              </MenubarItem>
              <MenubarItem
                onClick={onVerifyToken}
                className="text-md h-6 px-3"
              >
                {t("apps.applet-viewer.menu.login")}
              </MenubarItem>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>

      {/* Window Menu */}
      <MenubarMenu>
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
          {t("apps.applet-viewer.menu.window")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          {appletInstances.length > 0 ? (
            appletInstances.map((inst) => {
              const initialData = inst.initialData as { path?: string; content?: string } | undefined;
              const path = initialData?.path || "";
              const fileName = path
                ? path
                    .split("/")
                    .pop()
                    ?.replace(/\.(html|app)$/i, "") || t("apps.applet-viewer.menu.untitled")
                : t("apps.applet-viewer.menu.appletStore");
              const isActive = inst.instanceId === instanceId;

              return (
                <MenubarCheckboxItem
                  key={inst.instanceId}
                  checked={isActive}
                  onCheckedChange={(checked) => {
                    if (checked) bringInstanceToForeground(inst.instanceId);
                  }}
                  className="text-md h-6 px-3"
                >
                  {fileName}
                </MenubarCheckboxItem>
              );
            })
          ) : (
            <MenubarItem disabled className="text-md h-6 px-3 opacity-50">
              {t("apps.applet-viewer.menu.noAppletsOpen")}
            </MenubarItem>
          )}
        </MenubarContent>
      </MenubarMenu>
    </AppMenuBarShell>
  );
}
