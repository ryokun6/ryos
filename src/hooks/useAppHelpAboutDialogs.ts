import { useState } from "react";

/**
 * Shared open/close state for the Help and About dialogs that nearly every
 * app's logic hook needs. The rendering side is already shared via
 * `src/components/shared/AppHelpAboutDialogs.tsx`; this hook shares the
 * state side so logic hooks don't each re-declare the same two useStates.
 */
export function useAppHelpAboutDialogs() {
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);

  return {
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
  };
}
