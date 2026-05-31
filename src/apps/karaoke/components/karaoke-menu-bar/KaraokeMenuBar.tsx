import { MenuBar } from "@/components/layout/MenuBar";
import { AppShareItemDialog } from "@/components/shared/menubar/AppShareItemDialog";
import type { KaraokeMenuBarProps } from "./types";
import { useKaraokeMenuBar } from "./useKaraokeMenuBar";
import { KaraokeMenuBarFileMenu } from "./KaraokeMenuBarFileMenu";
import { KaraokeMenuBarControlsMenu } from "./KaraokeMenuBarControlsMenu";
import { KaraokeMenuBarViewMenu } from "./KaraokeMenuBarViewMenu";
import { KaraokeMenuBarLibraryMenu } from "./KaraokeMenuBarLibraryMenu";
import { KaraokeMenuBarHelpMenu } from "./KaraokeMenuBarHelpMenu";

export function KaraokeMenuBar(props: KaraokeMenuBarProps) {
  const vm = useKaraokeMenuBar(props);
  return (
    <MenuBar inWindowFrame={vm.isXpTheme}>
      <KaraokeMenuBarFileMenu vm={vm} />
      <KaraokeMenuBarControlsMenu vm={vm} />
      <KaraokeMenuBarViewMenu vm={vm} />
      <KaraokeMenuBarLibraryMenu vm={vm} />
      <KaraokeMenuBarHelpMenu vm={vm} />
      <AppShareItemDialog
        appId={vm.appId}
        appName={vm.appName}
        isOpen={vm.isShareDialogOpen}
        onClose={() => vm.setIsShareDialogOpen(false)}
      />
    </MenuBar>
  );
}
