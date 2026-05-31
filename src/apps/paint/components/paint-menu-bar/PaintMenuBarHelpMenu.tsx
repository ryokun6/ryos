import { AppMenuBarHelpMenu } from "@/components/shared/menubar/AppMenuBarHelpMenu";
import type { PaintMenuBarViewModel } from "./usePaintMenuBar";

export function PaintMenuBarHelpMenu({ vm }: { vm: PaintMenuBarViewModel }) {
  const { t, isMacOsxTheme, onShowHelp, onShowAbout, setIsShareDialogOpen } = vm;
  return (
    <AppMenuBarHelpMenu
      helpItemLabel={t("apps.paint.menu.paintHelp")}
      aboutItemLabel={t("apps.paint.menu.aboutPaint")}
      isMacOsxTheme={isMacOsxTheme}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
      onOpenShareDialog={() => setIsShareDialogOpen(true)}
    />
  );
}
