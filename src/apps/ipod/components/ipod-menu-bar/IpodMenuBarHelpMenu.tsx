import { AppMenuBarHelpMenu } from "@/components/shared/menubar/AppMenuBarHelpMenu";
import type { IpodMenuBarViewModel } from "./useIpodMenuBar";

export function IpodMenuBarHelpMenu({ vm }: { vm: IpodMenuBarViewModel }) {
  const { t, isMacOsxTheme, onShowHelp, onShowAbout, setIsShareDialogOpen } = vm;
  return (
    <AppMenuBarHelpMenu
      helpItemLabel={t("apps.ipod.menu.ipodHelp")}
      aboutItemLabel={t("apps.ipod.menu.aboutIpod")}
      shareItemLabel={t("apps.ipod.menu.shareApp")}
      isMacOsxTheme={isMacOsxTheme}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
      onOpenShareDialog={() => setIsShareDialogOpen(true)}
    />
  );
}
