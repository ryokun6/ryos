import { AppMenuBarHelpMenu } from "@/components/shared/menubar/AppMenuBarHelpMenu";
import type { KaraokeMenuBarViewModel } from "./useKaraokeMenuBar";

export function KaraokeMenuBarHelpMenu({ vm }: { vm: KaraokeMenuBarViewModel }) {
  const { t, isMacOsxTheme, onShowHelp, onShowAbout, setIsShareDialogOpen } =
    vm;
  return (
    <AppMenuBarHelpMenu
      helpItemLabel={t("apps.karaoke.menu.karaokeHelp")}
      aboutItemLabel={t("apps.karaoke.menu.aboutKaraoke")}
      shareItemLabel={t("apps.karaoke.menu.shareApp")}
      isMacOsxTheme={isMacOsxTheme}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
      onOpenShareDialog={() => setIsShareDialogOpen(true)}
    />
  );
}
