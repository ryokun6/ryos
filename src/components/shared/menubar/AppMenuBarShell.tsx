import { type ReactNode } from "react";
import { MenuBar } from "@/components/layout/MenuBar";
import { AppMenuBarHelpMenu } from "@/components/shared/menubar/AppMenuBarHelpMenu";
import { AppShareItemDialog } from "@/components/shared/menubar/AppShareItemDialog";
import type { AppId } from "@/config/appRegistry";

interface AppMenuBarShellProps {
  /** App identity + theme flags, typically spread from useAppMenuBarChrome. */
  appId: AppId;
  appName: string;
  isXpTheme: boolean;
  isMacOsxTheme: boolean;
  isShareDialogOpen: boolean;
  onShareDialogOpenChange: (open: boolean) => void;
  /** Help menu labels + actions. */
  helpItemLabel: string;
  aboutItemLabel: string;
  shareItemLabel?: string;
  onShowHelp?: () => void;
  onShowAbout?: () => void;
  /** App-specific menus rendered before the shared Help menu. */
  children: ReactNode;
}

/**
 * Standard app menubar wrapper: the app's own menus followed by the shared
 * Help menu and Share dialog, all inside the themed MenuBar frame. Lets each
 * app skip the identical boilerplate around its menus.
 */
export function AppMenuBarShell({
  appId,
  appName,
  isXpTheme,
  isMacOsxTheme,
  isShareDialogOpen,
  onShareDialogOpenChange,
  helpItemLabel,
  aboutItemLabel,
  shareItemLabel,
  onShowHelp,
  onShowAbout,
  children,
}: AppMenuBarShellProps) {
  return (
    <MenuBar inWindowFrame={isXpTheme}>
      {children}
      <AppMenuBarHelpMenu
        helpItemLabel={helpItemLabel}
        aboutItemLabel={aboutItemLabel}
        shareItemLabel={shareItemLabel}
        isMacOsxTheme={isMacOsxTheme}
        onShowHelp={onShowHelp}
        onShowAbout={onShowAbout}
        onOpenShareDialog={() => onShareDialogOpenChange(true)}
      />
      <AppShareItemDialog
        appId={appId}
        appName={appName}
        isOpen={isShareDialogOpen}
        onClose={() => onShareDialogOpenChange(false)}
      />
    </MenuBar>
  );
}
