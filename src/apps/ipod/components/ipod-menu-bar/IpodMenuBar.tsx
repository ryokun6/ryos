import { MenuBar } from "@/components/layout/MenuBar";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
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
      <ShareItemDialog
        isOpen={vm.isShareDialogOpen}
        onClose={() => vm.setIsShareDialogOpen(false)}
        itemType="App"
        itemIdentifier={vm.appId}
        title={vm.appName}
        generateShareUrl={generateAppShareUrl}
      />
    </MenuBar>
  );
}
