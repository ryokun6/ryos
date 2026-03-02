import { useState, useMemo } from "react";
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
import { MenuBar } from "@/components/layout/MenuBar";
import { useThemeStore } from "@/stores/useThemeStore";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import React from "react";
import { useAppStore } from "@/stores/useAppStore";
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
  isStudioActive?: boolean;
  hasStudioDraft?: boolean;
  onOpenStudio?: () => void;
  onCloseStudio?: () => void;
  onSaveStudioDraft?: () => Promise<unknown>;
  onPublishStudioDraft?: () => Promise<unknown>;
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
  isStudioActive = false,
  hasStudioDraft = false,
  onOpenStudio,
  onCloseStudio,
  onSaveStudioDraft,
  onPublishStudioDraft,
}: AppletViewerMenuBarProps) {
  const { t } = useTranslation();
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const appId = "applet-viewer";
  const appName = appRegistry[appId as keyof typeof appRegistry]?.name || appId;
  const currentTheme = useThemeStore((s) => s.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOsxTheme = currentTheme === "macosx";
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
  const authToken = useChatsStore((s) => s.authToken);
  const isLoggedIn = !!(username && authToken);

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
          {hasAppletContent && !isStudioActive && onOpenStudio && (
            <MenubarItem
              onClick={onOpenStudio}
              className="text-md h-6 px-3"
            >
              {t("apps.applet-viewer.menu.editInStudio", {
                defaultValue: "Edit in Ryo Studio",
              })}
            </MenubarItem>
          )}
          {isStudioActive && (
            <>
              {hasStudioDraft && onSaveStudioDraft ? (
                <MenubarItem
                  onClick={() => void onSaveStudioDraft()}
                  className="text-md h-6 px-3"
                >
                  {t("apps.applet-viewer.menu.saveDraft", {
                    defaultValue: "Save Draft",
                  })}
                </MenubarItem>
              ) : null}
              {hasStudioDraft && onPublishStudioDraft ? (
                <MenubarItem
                  onClick={() => void onPublishStudioDraft()}
                  className="text-md h-6 px-3"
                >
                  {t("apps.applet-viewer.menu.publishDraft", {
                    defaultValue: "Publish Draft",
                  })}
                </MenubarItem>
              ) : null}
              {onCloseStudio ? (
                <MenubarItem
                  onClick={onCloseStudio}
                  className="text-md h-6 px-3"
                >
                  {t("apps.applet-viewer.menu.exitStudio", {
                    defaultValue: "Exit Ryo Studio",
                  })}
                </MenubarItem>
              ) : null}
            </>
          )}
          {hasAppletContent && isLoggedIn && !isStudioActive && (
            <MenubarItem
              onClick={onShareApplet}
              className="text-md h-6 px-3"
            >
              {t("apps.applet-viewer.menu.shareApplet")}
            </MenubarItem>
          )}
          <MenubarSeparator className="h-[2px] bg-black my-1" />
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
          <MenubarSeparator className="h-[2px] bg-black my-1" />
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
          {onOpenStudio && (
            <MenubarItem
              onClick={onOpenStudio}
              className="text-md h-6 px-3"
            >
              {t("apps.applet-viewer.menu.createWithRyoStudio", {
                defaultValue: "Create with Ryo Studio",
              })}
            </MenubarItem>
          )}
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
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          {username && authToken ? (
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

      {/* Help Menu */}
      <MenubarMenu>
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onShowHelp}
            className="text-md h-6 px-3"
          >
            {t("apps.applet-viewer.menu.appletsHelp")}
          </MenubarItem>
          {!isMacOsxTheme && (
            <>
              <MenubarItem
                onSelect={() => setIsShareDialogOpen(true)}
                className="text-md h-6 px-3"
              >
                {t("common.menu.shareApp")}
              </MenubarItem>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarItem
                onClick={onShowAbout}
                className="text-md h-6 px-3"
              >
                {t("apps.applet-viewer.menu.aboutApplets")}
              </MenubarItem>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>
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
