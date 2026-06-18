import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import type { PaintMenuBarProps } from "./types";
import { usePaintMenuBar } from "./usePaintMenuBar";
import { PaintMenuBarFileMenu } from "./PaintMenuBarFileMenu";
import { PaintMenuBarEditMenu } from "./PaintMenuBarEditMenu";
import { PaintMenuBarFiltersMenu } from "./PaintMenuBarFiltersMenu";

export function PaintMenuBar(props: PaintMenuBarProps) {
  const vm = usePaintMenuBar(props);

  if (!vm.isWindowOpen) return null;

  return (
    <AppMenuBarShell
      isWindowsTheme={vm.isWindowsTheme}
      isMacOSTheme={vm.isMacOSTheme}
      appId={vm.appId}
      appName={vm.appName}
      isShareDialogOpen={vm.isShareDialogOpen}
      setIsShareDialogOpen={vm.setIsShareDialogOpen}
      helpItemLabel={vm.t("apps.paint.menu.paintHelp")}
      aboutItemLabel={vm.t("apps.paint.menu.aboutPaint")}
      onShowHelp={vm.onShowHelp}
      onShowAbout={vm.onShowAbout}
    >
      <PaintMenuBarFileMenu vm={vm} />
      <PaintMenuBarEditMenu vm={vm} />
      <PaintMenuBarFiltersMenu vm={vm} />
    </AppMenuBarShell>
  );
}
