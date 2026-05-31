import { MenuBar } from "@/components/layout/MenuBar";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import type { PaintMenuBarProps } from "./types";
import { usePaintMenuBar } from "./usePaintMenuBar";
import { PaintMenuBarFileMenu } from "./PaintMenuBarFileMenu";
import { PaintMenuBarEditMenu } from "./PaintMenuBarEditMenu";
import { PaintMenuBarFiltersMenu } from "./PaintMenuBarFiltersMenu";
import { PaintMenuBarHelpMenu } from "./PaintMenuBarHelpMenu";

export function PaintMenuBar(props: PaintMenuBarProps) {
  const vm = usePaintMenuBar(props);

  if (!vm.isWindowOpen) return null;

  return (
    <MenuBar inWindowFrame={vm.isXpTheme}>
      <PaintMenuBarFileMenu vm={vm} />
      <PaintMenuBarEditMenu vm={vm} />
      <PaintMenuBarFiltersMenu vm={vm} />
      <PaintMenuBarHelpMenu vm={vm} />
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
