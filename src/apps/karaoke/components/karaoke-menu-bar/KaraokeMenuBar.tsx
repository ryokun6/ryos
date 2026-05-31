import { MenuBar } from "@/components/layout/MenuBar";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { generateAppShareUrl } from "@/utils/sharedUrl";
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
