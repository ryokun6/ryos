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

  const { t, isXpTheme, isMacOsxTheme, menuBar } = c;

  return (
    <AppWindowShell
      isWindowOpen={isWindowOpen}
      isXpTheme={isXpTheme}
      isForeground={isForeground}
      menuBar={menuBar}
      windowFrameProps={{
        title: t("apps.contacts.title"),
        onClose,
        isForeground,
        appId: "contacts",
        material: isMacOsxTheme ? "brushedmetal" : "default",
        skipInitialSound,
        instanceId,
      }}
    >
      <ContactsWindowContent c={c} />
      <ContactsAppDialogs c={c} />
    </AppWindowShell>
  );
}
