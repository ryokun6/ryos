import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { MenuBar } from "@/components/layout/MenuBar";
import { useThemeStore } from "@/stores/useThemeStore";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import React from "react";
import { useAppStore } from "@/stores/useAppStore";
import { cn } from "@/lib/utils";
import { useChatsStore } from "@/stores/useChatsStore";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { appRegistry } from "@/config/appRegistry";
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
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const appId = "applet-viewer";
  const appName = appRegistry[appId as keyof typeof appRegistry]?.name || appId;
  const currentTheme = useThemeStore((s) => s.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const launchApp = useLaunchApp();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const bringInstanceToForeground = useAppStore(
    (s) => s.bringInstanceToForeground
  );
  const instances = useAppStore((s) => s.instances);
  const username = useChatsStore((s) => s.username);
  const authToken = useChatsStore((s) => s.authToken);
  const isLoggedIn = !!(username && authToken);

  // Get all active applet viewer instances
  const appletInstances = Object.values(instances).filter(
    (inst) => inst.appId === "applet-viewer" && inst.isOpen
  );

  return (
    <MenuBar inWindowFrame={isXpTheme}>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".html,.htm,.app,.gz"
        className="hidden"
      />
      {/* File Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 text-md px-2 py-1 border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0"
          >
            {t("common.menu.file")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={() => launchApp("finder", { initialPath: "/Applets" })}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("apps.applet-viewer.menu.open")}
          </DropdownMenuItem>
          {hasAppletContent && isLoggedIn && (
            <DropdownMenuItem
              onClick={onShareApplet}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              {t("apps.applet-viewer.menu.shareApplet")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={() => fileInputRef.current?.click()}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("apps.applet-viewer.menu.importFromDevice")}
          </DropdownMenuItem>
          {hasAppletContent && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="text-md h-6 px-3 active:bg-gray-900 active:text-white">
                {t("apps.applet-viewer.menu.exportAs")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem
                  onClick={onExportAsApp}
                  className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
                >
                  {t("apps.applet-viewer.menu.ryosApp")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onExportAsHtml}
                  className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
                >
                  {t("apps.applet-viewer.menu.html")}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onClose}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("common.menu.close")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Store Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 text-md px-2 py-1 border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0"
          >
            {t("apps.applet-viewer.menu.store")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={() => launchApp("applet-viewer", { 
              initialData: { path: "", content: "" } 
            })}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("apps.applet-viewer.menu.openAppletStore")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={async () => {
              if (updateCount > 0 && onUpdateAll) {
                await onUpdateAll();
              } else if (onCheckForUpdates) {
                await onCheckForUpdates();
              }
            }}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {updateCount > 0
              ? updateCount === 1
                ? t("apps.applet-viewer.menu.updateApplets", { count: updateCount })
                : t("apps.applet-viewer.menu.updateAppletsPlural", { count: updateCount })
              : t("apps.applet-viewer.menu.checkForUpdates")}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          {username && authToken ? (
            <DropdownMenuItem
              onClick={() => onLogout?.()}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              {t("apps.applet-viewer.menu.logOut")}
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem
                onClick={onSetUsername}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                {t("apps.applet-viewer.menu.createAccount")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onVerifyToken}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                {t("apps.applet-viewer.menu.login")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Window Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 px-2 py-1 text-md focus-visible:ring-0 hover:bg-gray-200 active:bg-gray-900 active:text-white"
          >
            {t("apps.applet-viewer.menu.window")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
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
                <DropdownMenuItem
                  key={inst.instanceId}
                  onClick={() => bringInstanceToForeground(inst.instanceId)}
                  className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
                >
                  <span className={cn(!isActive && "pl-4")}>
                    {isActive ? `✓ ${fileName}` : fileName}
                  </span>
                </DropdownMenuItem>
              );
            })
          ) : (
            <DropdownMenuItem disabled className="text-md h-6 px-3 opacity-50">
              {t("apps.applet-viewer.menu.noAppletsOpen")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Help Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 px-2 py-1 text-md focus-visible:ring-0 hover:bg-gray-200 active:bg-gray-900 active:text-white"
          >
            {t("common.menu.help")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={onShowHelp}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("apps.applet-viewer.menu.appletsHelp")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setIsShareDialogOpen(true)}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("common.menu.shareApp")}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onShowAbout}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("apps.applet-viewer.menu.aboutApplets")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ShareItemDialog
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
        itemType="App"
        itemIdentifier={appId}
        title={appName}
        generateShareUrl={generateAppShareUrl}
      />
    </MenuBar>
  );
}
