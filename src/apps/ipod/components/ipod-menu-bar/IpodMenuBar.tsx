import { MenuBar } from "@/components/layout/MenuBar";
import { AppShareItemDialog } from "@/components/shared/menubar/AppShareItemDialog";
import type { IpodMenuBarProps } from "./types";
import { useIpodMenuBar } from "./useIpodMenuBar";
import { IpodMenuBarFileMenu } from "./IpodMenuBarFileMenu";
import { IpodMenuBarControlsMenu } from "./IpodMenuBarControlsMenu";
import { IpodMenuBarViewMenu } from "./IpodMenuBarViewMenu";
import { IpodMenuBarLibraryMenu } from "./IpodMenuBarLibraryMenu";
import { AppMenuBarHelpMenu } from "@/components/shared/menubar/AppMenuBarHelpMenu";

export function IpodMenuBar(props: IpodMenuBarProps) {
  const vm = useIpodMenuBar(props);
  return (
    <MenuBar inWindowFrame={vm.isXpTheme}>
      <IpodMenuBarFileMenu vm={vm} />
      <IpodMenuBarControlsMenu vm={vm} />
      <IpodMenuBarViewMenu vm={vm} />
      <IpodMenuBarLibraryMenu vm={vm} />
      <AppMenuBarHelpMenu
        helpItemLabel={vm.t("apps.ipod.menu.ipodHelp")}
        aboutItemLabel={vm.t("apps.ipod.menu.aboutIpod")}
        shareItemLabel={vm.t("apps.ipod.menu.shareApp")}
        isMacOsxTheme={vm.isMacOsxTheme}
        onShowHelp={vm.onShowHelp}
        onShowAbout={vm.onShowAbout}
        onOpenShareDialog={() => vm.setIsShareDialogOpen(true)}
      />
      <AppShareItemDialog
        appId={vm.appId}
        appName={vm.appName}
        isOpen={vm.isShareDialogOpen}
        onClose={() => vm.setIsShareDialogOpen(false)}
      />
    </MenuBar>
  );
}
