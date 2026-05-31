import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import type { KaraokeMenuBarProps } from "./types";
import { useKaraokeMenuBar } from "./useKaraokeMenuBar";
import { KaraokeMenuBarFileMenu } from "./KaraokeMenuBarFileMenu";
import { KaraokeMenuBarControlsMenu } from "./KaraokeMenuBarControlsMenu";
import { KaraokeMenuBarViewMenu } from "./KaraokeMenuBarViewMenu";
import { KaraokeMenuBarLibraryMenu } from "./KaraokeMenuBarLibraryMenu";

export function KaraokeMenuBar(props: KaraokeMenuBarProps) {
  const vm = useKaraokeMenuBar(props);
  return (
    <AppMenuBarShell
      appId={vm.appId}
      appName={vm.appName}
      isXpTheme={vm.isXpTheme}
      isMacOsxTheme={vm.isMacOsxTheme}
      isShareDialogOpen={vm.isShareDialogOpen}
      onShareDialogOpenChange={vm.setIsShareDialogOpen}
      helpItemLabel={vm.t("apps.karaoke.menu.karaokeHelp")}
      aboutItemLabel={vm.t("apps.karaoke.menu.aboutKaraoke")}
      shareItemLabel={vm.t("apps.karaoke.menu.shareApp")}
      onShowHelp={vm.onShowHelp}
      onShowAbout={vm.onShowAbout}
    >
      <KaraokeMenuBarFileMenu vm={vm} />
      <KaraokeMenuBarControlsMenu vm={vm} />
      <KaraokeMenuBarViewMenu vm={vm} />
      <KaraokeMenuBarLibraryMenu vm={vm} />
    </AppMenuBarShell>
  );
}
