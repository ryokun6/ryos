import { MenuBar } from "@/components/layout/MenuBar";
import { AppShareItemDialog } from "@/components/shared/menubar/AppShareItemDialog";
import type { InternetExplorerMenuBarProps } from "./types";
import { useInternetExplorerMenuBar } from "./useInternetExplorerMenuBar";
import { IeMenuBarFileMenu } from "./IeMenuBarFileMenu";
import { IeMenuBarEditMenu } from "./IeMenuBarEditMenu";
import { IeMenuBarFavoritesMenu } from "./IeMenuBarFavoritesMenu";
import { IeMenuBarHistoryMenu } from "./IeMenuBarHistoryMenu";
import { AppMenuBarHelpMenu } from "@/components/shared/menubar/AppMenuBarHelpMenu";

export function InternetExplorerMenuBar(props: InternetExplorerMenuBarProps) {
  const vm = useInternetExplorerMenuBar(props);

  return (
    <MenuBar inWindowFrame={vm.isXpTheme}>
      <IeMenuBarFileMenu vm={vm} />
      <IeMenuBarEditMenu vm={vm} />
      <IeMenuBarFavoritesMenu vm={vm} />
      <IeMenuBarHistoryMenu vm={vm} />
      <AppMenuBarHelpMenu
        helpItemLabel={vm.t("apps.internet-explorer.menu.internetExplorerHelp")}
        aboutItemLabel={vm.t(
          "apps.internet-explorer.menu.aboutInternetExplorer"
        )}
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
