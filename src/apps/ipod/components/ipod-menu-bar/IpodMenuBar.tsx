import { MenuBar } from "@/components/layout/MenuBar";
import { AppShareItemDialog } from "@/components/shared/menubar/AppShareItemDialog";
import type { IpodMenuBarProps } from "./types";
import { useIpodMenuBar } from "./useIpodMenuBar";
import { IpodMenuBarFileMenu } from "./IpodMenuBarFileMenu";
import { IpodMenuBarControlsMenu } from "./IpodMenuBarControlsMenu";
import { IpodMenuBarViewMenu } from "./IpodMenuBarViewMenu";
import { IpodMenuBarLibraryMenu } from "./IpodMenuBarLibraryMenu";
import { IpodMenuBarHelpMenu } from "./IpodMenuBarHelpMenu";

export function IpodMenuBar(props: IpodMenuBarProps) {
  const vm = useIpodMenuBar(props);
  return (
    <MenuBar inWindowFrame={vm.isXpTheme}>
      <IpodMenuBarFileMenu vm={vm} />
      <IpodMenuBarControlsMenu vm={vm} />
      <IpodMenuBarViewMenu vm={vm} />
      <IpodMenuBarLibraryMenu vm={vm} />
      <IpodMenuBarHelpMenu vm={vm} />
      <AppShareItemDialog
        appId={vm.appId}
        appName={vm.appName}
        isOpen={vm.isShareDialogOpen}
        onClose={() => vm.setIsShareDialogOpen(false)}
      />
    </MenuBar>
  );
}
