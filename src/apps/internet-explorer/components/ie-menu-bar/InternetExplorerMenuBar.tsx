import { MenuBar } from "@/components/layout/MenuBar";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import type { InternetExplorerMenuBarProps } from "./types";
import { useInternetExplorerMenuBar } from "./useInternetExplorerMenuBar";
import { IeMenuBarFileMenu } from "./IeMenuBarFileMenu";
import { IeMenuBarEditMenu } from "./IeMenuBarEditMenu";
import { IeMenuBarFavoritesMenu } from "./IeMenuBarFavoritesMenu";
import { IeMenuBarHistoryMenu } from "./IeMenuBarHistoryMenu";
import { IeMenuBarHelpMenu } from "./IeMenuBarHelpMenu";

export function InternetExplorerMenuBar(props: InternetExplorerMenuBarProps) {
  const vm = useInternetExplorerMenuBar(props);

  return (
    <MenuBar inWindowFrame={vm.isXpTheme}>
      <IeMenuBarFileMenu vm={vm} />
      <IeMenuBarEditMenu vm={vm} />
      <IeMenuBarFavoritesMenu vm={vm} />
      <IeMenuBarHistoryMenu vm={vm} />
      <IeMenuBarHelpMenu vm={vm} />
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
