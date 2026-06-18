import { useState } from "react";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { appRegistry, type AppId } from "@/config/appRegistry";

/** Share dialog state, theme flags, and app identity shared by refactored app menubars. */
export function useAppMenuBarChrome(
  appId: AppId,
  appNameOverride?: string,
) {
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const { isWindowsTheme, isMacOSTheme } = useThemeFlags();
  const appName =
    appNameOverride ??
    appRegistry[appId as keyof typeof appRegistry]?.name ??
    appId;

  return {
    isShareDialogOpen,
    setIsShareDialogOpen,
    isWindowsTheme,
    isMacOSTheme,
    appId,
    appName,
  };
}
