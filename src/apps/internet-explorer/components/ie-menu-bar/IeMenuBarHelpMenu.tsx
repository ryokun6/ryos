import { AppMenuBarHelpMenu } from "@/components/shared/menubar/AppMenuBarHelpMenu";
import type { InternetExplorerMenuBarViewModel } from "./useInternetExplorerMenuBar";

export function IeMenuBarHelpMenu({
  vm,
}: {
  vm: InternetExplorerMenuBarViewModel;
}) {
  const { t, onShowHelp, onShowAbout, isMacOsxTheme, setIsShareDialogOpen } =
    vm;

  return (
    <AppMenuBarHelpMenu
      helpItemLabel={t("apps.internet-explorer.menu.internetExplorerHelp")}
      aboutItemLabel={t("apps.internet-explorer.menu.aboutInternetExplorer")}
      isMacOsxTheme={isMacOsxTheme}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
      onOpenShareDialog={() => setIsShareDialogOpen(true)}
    />
  );
}
