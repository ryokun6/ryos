import { MenuBar } from "@/components/layout/MenuBar";
import { AppShareItemDialog } from "@/components/shared/menubar/AppShareItemDialog";
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
      <AppShareItemDialog
        appId={vm.appId}
        appName={vm.appName}
        isOpen={vm.isShareDialogOpen}
        onClose={() => vm.setIsShareDialogOpen(false)}
      />
    </MenuBar>
  );
}
