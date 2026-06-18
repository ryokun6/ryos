import type { ReactNode } from "react";
import { MenuBar } from "@/components/layout/MenuBar";
import { AppMenuBarHelpMenu } from "@/components/shared/menubar/AppMenuBarHelpMenu";
import { AppShareItemDialog } from "@/components/shared/menubar/AppShareItemDialog";
import type { AppId } from "@/config/appRegistry";

interface AppMenuBarShellProps {
  /** App-specific menus (File, Controls, View, Library, ...). */
  children: ReactNode;
  isWindowsTheme: boolean;
  isMacOSTheme: boolean;
  appId: AppId;
  appName: string;
  isShareDialogOpen: boolean;
  setIsShareDialogOpen: (open: boolean) => void;
  helpItemLabel: string;
  aboutItemLabel: string;
  /** Optional override; defaults to the shared `common.menu.shareApp` label. */
  shareItemLabel?: string;
  onShowHelp?: () => void;
  onShowAbout?: () => void;
}

/**
 * Standard ryOS media-app menubar: app menus followed by the shared
 * Help/About/Share menu and the share dialog. Apps pass their own menu
 * components as children and supply translation-key-driven labels.
 */
export function AppMenuBarShell({
  children,
  isWindowsTheme,
  isMacOSTheme,
  appId,
  appName,
  isShareDialogOpen,
  setIsShareDialogOpen,
  helpItemLabel,
  aboutItemLabel,
  shareItemLabel,
  onShowHelp,
  onShowAbout,
}: AppMenuBarShellProps) {
  return (
    <MenuBar inWindowFrame={isWindowsTheme}>
      {children}
      <AppMenuBarHelpMenu
        helpItemLabel={helpItemLabel}
        aboutItemLabel={aboutItemLabel}
        shareItemLabel={shareItemLabel}
        isMacOSTheme={isMacOSTheme}
        onShowHelp={onShowHelp}
        onShowAbout={onShowAbout}
        onOpenShareDialog={() => setIsShareDialogOpen(true)}
      />
      <AppShareItemDialog
        appId={appId}
        appName={appName}
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
      />
    </MenuBar>
  );
}
