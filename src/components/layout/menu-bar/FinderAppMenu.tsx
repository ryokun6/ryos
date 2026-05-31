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
import { getTranslatedAppName } from "@/utils/i18n";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { appMetadata as finderMetadata, helpItems as finderHelpItems } from "@/apps/finder/metadata";

export function FinderAppMenu() {
  const { t } = useTranslation();
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const translatedHelpItems = useTranslatedHelpItems("finder", finderHelpItems);

  const {
    instances,
    minimizeInstance,
    restoreInstance,
  } = useAppStoreShallow((s) => ({
    instances: s.instances,
    minimizeInstance: s.minimizeInstance,
    restoreInstance: s.restoreInstance,
  }));

  // Get translated Finder name
  const translatedFinderName = getTranslatedAppName("finder");

  // Check if there are any minimized instances
  const hasMinimizedInstances = Object.values(instances).some(
    (inst) => inst.isOpen && inst.isMinimized
  );

  // Hide others - minimize all open app instances
  const handleHideOthers = () => {
    Object.values(instances).forEach((inst) => {
      if (inst.isOpen && !inst.isMinimized) {
        minimizeInstance(inst.instanceId);
      }
    });
  };

  // Show all - restore all minimized instances
  const handleShowAll = () => {
    Object.values(instances).forEach((inst) => {
      if (inst.isOpen && inst.isMinimized) {
        restoreInstance(inst.instanceId);
      }
    });
  };

  return (
    <>
      <MenubarMenu>
        <MenubarTrigger
          className="text-md px-2 py-1 border-none focus-visible:ring-0 app-menu-trigger"
          style={{ fontWeight: "bold" }}
        >
          {translatedFinderName}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          {/* About Finder */}
          <MenubarItem
            onClick={() => setIsAboutDialogOpen(true)}
            className="text-md h-6 px-3"
          >
            {t("common.appMenu.aboutApp", { appName: translatedFinderName })}
          </MenubarItem>

          {/* Share App */}
          <MenubarItem
            onSelect={() => setIsShareDialogOpen(true)}
            className="text-md h-6 px-3"
          >
            {t("common.menu.shareApp")}
          </MenubarItem>

          <MenubarSeparator className="h-[2px] bg-black my-1" />

          {/* Hide Others */}
          <MenubarItem
            onClick={handleHideOthers}
            className="text-md h-6 px-3"
          >
            {t("common.appMenu.hideOthers")}
          </MenubarItem>

          {/* Show All - only when there are minimized windows */}
          {hasMinimizedInstances && (
            <MenubarItem
              onClick={handleShowAll}
              className="text-md h-6 px-3"
            >
              {t("common.appMenu.showAll")}
            </MenubarItem>
          )}
        </MenubarContent>
      </MenubarMenu>

      {/* Help Dialog */}
      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        appId="finder"
        helpItems={translatedHelpItems}
      />

      {/* About Dialog */}
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={finderMetadata}
        appId="finder"
      />

      {/* Share Dialog */}
      <ShareItemDialog
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
        itemType="App"
        itemIdentifier="finder"
        title={translatedFinderName}
        generateShareUrl={generateAppShareUrl}
      />
    </>
  );
}
