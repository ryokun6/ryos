import type { AppProps } from "@/apps/base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
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

  if (!isWindowOpen) {
    return null;
  }

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={t("apps.contacts.title")}
        onClose={onClose}
        isForeground={isForeground}
        appId="contacts"
        material={isMacOsxTheme ? "brushedmetal" : "default"}
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <ContactsWindowContent c={c} />
        <ContactsAppDialogs c={c} />
      </WindowFrame>
    </>
  );
}
