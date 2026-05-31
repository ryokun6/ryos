import { MenuBar } from "@/components/layout/MenuBar";
import { AppShareItemDialog } from "@/components/shared/menubar/AppShareItemDialog";
import type { PaintMenuBarProps } from "./types";
import { usePaintMenuBar } from "./usePaintMenuBar";
import { PaintMenuBarFileMenu } from "./PaintMenuBarFileMenu";
import { PaintMenuBarEditMenu } from "./PaintMenuBarEditMenu";
import { PaintMenuBarFiltersMenu } from "./PaintMenuBarFiltersMenu";
import { AppMenuBarHelpMenu } from "@/components/shared/menubar/AppMenuBarHelpMenu";

export function PaintMenuBar(props: PaintMenuBarProps) {
  const vm = usePaintMenuBar(props);

  if (!vm.isWindowOpen) return null;

  return (
    <MenuBar inWindowFrame={vm.isXpTheme}>
      <PaintMenuBarFileMenu vm={vm} />
      <PaintMenuBarEditMenu vm={vm} />
      <PaintMenuBarFiltersMenu vm={vm} />
      <AppMenuBarHelpMenu
        helpItemLabel={vm.t("apps.paint.menu.paintHelp")}
        aboutItemLabel={vm.t("apps.paint.menu.aboutPaint")}
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
