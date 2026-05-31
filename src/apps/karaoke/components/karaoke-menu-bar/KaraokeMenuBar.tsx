import { MenuBar } from "@/components/layout/MenuBar";
import { AppShareItemDialog } from "@/components/shared/menubar/AppShareItemDialog";
import type { KaraokeMenuBarProps } from "./types";
import { useKaraokeMenuBar } from "./useKaraokeMenuBar";
import { KaraokeMenuBarFileMenu } from "./KaraokeMenuBarFileMenu";
import { KaraokeMenuBarControlsMenu } from "./KaraokeMenuBarControlsMenu";
import { KaraokeMenuBarViewMenu } from "./KaraokeMenuBarViewMenu";
import { KaraokeMenuBarLibraryMenu } from "./KaraokeMenuBarLibraryMenu";
import { AppMenuBarHelpMenu } from "@/components/shared/menubar/AppMenuBarHelpMenu";

export function KaraokeMenuBar(props: KaraokeMenuBarProps) {
  const vm = useKaraokeMenuBar(props);
  return (
    <MenuBar inWindowFrame={vm.isXpTheme}>
      <KaraokeMenuBarFileMenu vm={vm} />
      <KaraokeMenuBarControlsMenu vm={vm} />
      <KaraokeMenuBarViewMenu vm={vm} />
      <KaraokeMenuBarLibraryMenu vm={vm} />
      <AppMenuBarHelpMenu
        helpItemLabel={vm.t("apps.karaoke.menu.karaokeHelp")}
        aboutItemLabel={vm.t("apps.karaoke.menu.aboutKaraoke")}
        shareItemLabel={vm.t("apps.karaoke.menu.shareApp")}
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
