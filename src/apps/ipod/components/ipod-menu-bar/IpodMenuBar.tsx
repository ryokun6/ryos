import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import type { IpodMenuBarProps } from "./types";
import { useIpodMenuBar } from "./useIpodMenuBar";
import { IpodMenuBarFileMenu } from "./IpodMenuBarFileMenu";
import { IpodMenuBarControlsMenu } from "./IpodMenuBarControlsMenu";
import { IpodMenuBarViewMenu } from "./IpodMenuBarViewMenu";
import { IpodMenuBarLibraryMenu } from "./IpodMenuBarLibraryMenu";

export function IpodMenuBar(props: IpodMenuBarProps) {
  const vm = useIpodMenuBar(props);
  return (
    <AppMenuBarShell
      isWindowsTheme={vm.isWindowsTheme}
      isMacOSTheme={vm.isMacOSTheme}
      appId={vm.appId}
      appName={vm.appName}
      isShareDialogOpen={vm.isShareDialogOpen}
      setIsShareDialogOpen={vm.setIsShareDialogOpen}
      helpItemLabel={vm.t("apps.ipod.menu.ipodHelp")}
      aboutItemLabel={vm.t("apps.ipod.menu.aboutIpod")}
      shareItemLabel={vm.t("apps.ipod.menu.shareApp")}
      onShowHelp={vm.onShowHelp}
      onShowAbout={vm.onShowAbout}
    >
      <IpodMenuBarFileMenu vm={vm} />
      <IpodMenuBarControlsMenu vm={vm} />
      <IpodMenuBarViewMenu vm={vm} />
      <IpodMenuBarLibraryMenu vm={vm} />
    </AppMenuBarShell>
  );
}
