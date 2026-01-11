import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
} from "@/components/ui/menubar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import { useAppStoreShallow } from "@/stores/helpers";
import { appRegistry, type AppId } from "@/config/appRegistry";
import { getTranslatedAppName } from "@/utils/i18n";

// Apps that support multiple windows
const MULTI_INSTANCE_APPS: AppId[] = ["textedit", "finder", "applet-viewer"];

// Apps that support fullscreen mode
const FULLSCREEN_APPS: AppId[] = ["ipod", "karaoke", "videos", "pc"];

interface AppMenuProps {
  appId: AppId;
  appName: string;
  instanceId: string;
  onShowAbout?: () => void;
}

export function AppMenu({
  appId,
  appName,
  instanceId,
  onShowAbout,
}: AppMenuProps) {
  const { t } = useTranslation();
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);

  const {
    instances,
    minimizeInstance,
    restoreInstance,
    closeAppInstance,
  } = useAppStoreShallow((s) => ({
    instances: s.instances,
    minimizeInstance: s.minimizeInstance,
    restoreInstance: s.restoreInstance,
    closeAppInstance: s.closeAppInstance,
  }));

  // Get app metadata for help and about dialogs
  const app = appRegistry[appId];
  const helpItems = app?.helpItems || [];
  const metadata = app?.metadata;

  // Get translated app name
  const translatedAppName = getTranslatedAppName(appId);

  // Check if this app supports multiple instances
  const supportsMultiInstance = MULTI_INSTANCE_APPS.includes(appId);

  // Check if this app supports fullscreen
  const supportsFullScreen = FULLSCREEN_APPS.includes(appId);

  // Get all open instances of this app
  const appInstances = Object.values(instances).filter(
    (inst) => inst.appId === appId && inst.isOpen
  );

  // Check if there are any minimized instances of this app
  const hasMinimizedInstances = appInstances.some((inst) => inst.isMinimized);

  // Hide this app (minimize the current instance)
  const handleHide = () => {
    minimizeInstance(instanceId);
  };

  // Hide others - minimize all other app instances
  const handleHideOthers = () => {
    Object.values(instances).forEach((inst) => {
      if (inst.isOpen && inst.instanceId !== instanceId && !inst.isMinimized) {
        minimizeInstance(inst.instanceId);
      }
    });
  };

  // Show all - restore all minimized instances of this app
  const handleShowAll = () => {
    appInstances.forEach((inst) => {
      if (inst.isMinimized) {
        restoreInstance(inst.instanceId);
      }
    });
  };

  // Toggle fullscreen - dispatch event for app to handle
  const handleFullScreen = () => {
    window.dispatchEvent(new CustomEvent("toggleAppFullScreen", { 
      detail: { appId, instanceId } 
    }));
  };

  // Handle showing about - use provided handler or fallback to dialog
  const handleShowAbout = () => {
    if (onShowAbout) {
      onShowAbout();
    } else {
      setIsAboutDialogOpen(true);
    }
  };

  // Quit app (close current instance)
  const handleQuit = () => {
    closeAppInstance(instanceId);
  };

  return (
    <>
      <MenubarMenu>
        <MenubarTrigger 
          className="text-md px-2 py-1 border-none focus-visible:ring-0 app-menu-trigger"
          style={{ fontWeight: "bold" }}
        >
          {translatedAppName}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          {/* About App */}
          <MenubarItem
            onClick={handleShowAbout}
            className="text-md h-6 px-3"
          >
            {t("common.appMenu.aboutApp", { appName: translatedAppName })}
          </MenubarItem>

          {/* Share App */}
          <MenubarItem
            onSelect={() => setIsShareDialogOpen(true)}
            className="text-md h-6 px-3"
          >
            {t("common.menu.shareApp")}
          </MenubarItem>

          <MenubarSeparator className="h-[2px] bg-black my-1" />

          {/* Hide App */}
          <MenubarItem
            onClick={handleHide}
            className="text-md h-6 px-3"
          >
            {t("common.appMenu.hideApp", { appName: translatedAppName })}
          </MenubarItem>

          {/* Hide Others */}
          <MenubarItem
            onClick={handleHideOthers}
            className="text-md h-6 px-3"
          >
            {t("common.appMenu.hideOthers")}
          </MenubarItem>

          {/* Show All - only for multi-instance apps with minimized windows */}
          {supportsMultiInstance && hasMinimizedInstances && (
            <MenubarItem
              onClick={handleShowAll}
              className="text-md h-6 px-3"
            >
              {t("common.appMenu.showAll")}
            </MenubarItem>
          )}

          {/* Full Screen - only for apps that support it */}
          {supportsFullScreen && (
            <MenubarItem
              onClick={handleFullScreen}
              className="text-md h-6 px-3"
            >
              {t("common.appMenu.fullScreen")}
            </MenubarItem>
          )}

          <MenubarSeparator className="h-[2px] bg-black my-1" />

          {/* Quit App */}
          <MenubarItem
            onClick={handleQuit}
            className="text-md h-6 px-3"
          >
            {t("common.appMenu.quitApp", { appName: translatedAppName })}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Help Dialog (fallback if no onShowHelp provided) */}
      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        appId={appId}
        helpItems={helpItems}
      />

      {/* About Dialog (fallback if no onShowAbout provided) */}
      {metadata && (
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setIsAboutDialogOpen}
          metadata={metadata}
          appId={appId}
        />
      )}

      {/* Share Dialog */}
      <ShareItemDialog
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
        itemType="App"
        itemIdentifier={appId}
        title={appName}
        generateShareUrl={generateAppShareUrl}
      />
    </>
  );
}
