import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import type { InternetExplorerMenuBarProps } from "./types";
import { useInternetExplorerMenuBar } from "./useInternetExplorerMenuBar";
import { IeMenuBarFileMenu } from "./IeMenuBarFileMenu";
import { IeMenuBarEditMenu } from "./IeMenuBarEditMenu";
import { IeMenuBarFavoritesMenu } from "./IeMenuBarFavoritesMenu";
import { IeMenuBarHistoryMenu } from "./IeMenuBarHistoryMenu";

export function InternetExplorerMenuBar(props: InternetExplorerMenuBarProps) {
  const vm = useInternetExplorerMenuBar(props);

  return (
    <AppMenuBarShell
      isWindowsTheme={vm.isWindowsTheme}
      isMacOSTheme={vm.isMacOSTheme}
      appId={vm.appId}
      appName={vm.appName}
      isShareDialogOpen={vm.isShareDialogOpen}
      setIsShareDialogOpen={vm.setIsShareDialogOpen}
      helpItemLabel={vm.t("apps.internet-explorer.menu.internetExplorerHelp")}
      aboutItemLabel={vm.t("apps.internet-explorer.menu.aboutInternetExplorer")}
      onShowHelp={vm.onShowHelp}
      onShowAbout={vm.onShowAbout}
    >
      <IeMenuBarFileMenu vm={vm} />
      <IeMenuBarEditMenu vm={vm} />
      <IeMenuBarFavoritesMenu vm={vm} />
      <IeMenuBarHistoryMenu vm={vm} />
    </AppMenuBarShell>
  );
}
