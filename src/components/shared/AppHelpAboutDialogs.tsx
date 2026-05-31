import { ComponentProps } from "react";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import type { AppId } from "@/config/appRegistry";

interface AppHelpAboutDialogsProps {
  appId: AppId;
  helpItems: ComponentProps<typeof HelpDialog>["helpItems"];
  metadata: ComponentProps<typeof AboutDialog>["metadata"];
  isHelpOpen: boolean;
  onHelpOpenChange: (open: boolean) => void;
  isAboutOpen: boolean;
  onAboutOpenChange: (open: boolean) => void;
}

/**
 * Shared Help + About dialog pair rendered by nearly every app. Replaces the
 * repeated two-dialog block wired to `isHelpDialogOpen` / `isAboutDialogOpen`.
 */
export function AppHelpAboutDialogs({
  appId,
  helpItems,
  metadata,
  isHelpOpen,
  onHelpOpenChange,
  isAboutOpen,
  onAboutOpenChange,
}: AppHelpAboutDialogsProps) {
  return (
    <>
      <HelpDialog
        isOpen={isHelpOpen}
        onOpenChange={onHelpOpenChange}
        helpItems={helpItems}
        appId={appId}
      />
      <AboutDialog
        isOpen={isAboutOpen}
        onOpenChange={onAboutOpenChange}
        metadata={metadata}
        appId={appId}
      />
    </>
  );
}
