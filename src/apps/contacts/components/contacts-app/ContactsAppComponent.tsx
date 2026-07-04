import type { AppProps } from "@/apps/base/types";
import { AppWindowShell } from "@/components/shared/AppWindowShell";
import { ContactsAppDialogs } from "./ContactsAppDialogs";
import { ContactsWindowContent } from "./ContactsWindowContent";
import { useContactsAppController } from "./useContactsAppController";

export function ContactsAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
}: AppProps) {
  const c = useContactsAppController({
    isWindowOpen,
    onClose,
    isForeground,
    skipInitialSound,
    instanceId,
  });

  const { t, isWindowsTheme, isMacOSTheme, menuBar, hasHydrated } = c;

  return (
    <AppWindowShell
      isWindowOpen={isWindowOpen}
      isWindowsTheme={isWindowsTheme}
      isForeground={isForeground}
      menuBar={hasHydrated ? menuBar : undefined}
      windowFrameProps={{
        title: t("apps.contacts.title"),
        onClose,
        isForeground,
        appId: "contacts",
        material: isMacOSTheme ? "brushedmetal" : "default",
        skipInitialSound,
        instanceId,
      }}
    >
      {hasHydrated && (
        <>
          <ContactsWindowContent c={c} />
          <ContactsAppDialogs c={c} />
        </>
      )}
    </AppWindowShell>
  );
}
