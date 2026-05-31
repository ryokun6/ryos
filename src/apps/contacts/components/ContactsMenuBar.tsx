import {
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  MENUBAR_ITEM_CLASS,
  MENUBAR_SEPARATOR_CLASS,
  MENUBAR_TRIGGER_CLASS,
} from "@/components/shared/menubar/menubarStyles";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { requestCloudSyncDomainCheck } from "@/utils/cloudSyncEvents";
import { useTranslation } from "react-i18next";

interface ContactsMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onNewContact: () => void;
  onImport: () => void;
  onDeleteContact: () => void;
  onMarkAsMine: () => void;
  hasSelectedContact: boolean;
  isSelectedMine: boolean;
}

export function ContactsMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  onNewContact,
  onImport,
  onDeleteContact,
  onMarkAsMine,
  hasSelectedContact,
  isSelectedMine,
}: ContactsMenuBarProps) {
  const { t } = useTranslation();
  const {
    isShareDialogOpen,
    setIsShareDialogOpen,
    isXpTheme,
    isMacOsxTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("contacts");

  return (
    <AppMenuBarShell
      isXpTheme={isXpTheme}
      isMacOsxTheme={isMacOsxTheme}
      appId={appId}
      appName={appName}
      isShareDialogOpen={isShareDialogOpen}
      setIsShareDialogOpen={setIsShareDialogOpen}
      helpItemLabel={t("apps.contacts.menu.help")}
      aboutItemLabel={t("apps.contacts.menu.about")}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
    >
      <MenubarMenu>
        <MenubarTrigger className={MENUBAR_TRIGGER_CLASS}>
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem onClick={onNewContact} className={MENUBAR_ITEM_CLASS}>
            {t("apps.contacts.menu.newContact")}
          </MenubarItem>
          <MenubarItem onClick={onImport} className={MENUBAR_ITEM_CLASS}>
            {t("apps.contacts.menu.importVCard")}
          </MenubarItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem
            onClick={() => requestCloudSyncDomainCheck("contacts")}
            className={MENUBAR_ITEM_CLASS}
          >
            {t("apps.contacts.menu.syncContacts", {
              defaultValue: "Sync Contacts",
            })}
          </MenubarItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem onClick={onClose} className={MENUBAR_ITEM_CLASS}>
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className={MENUBAR_TRIGGER_CLASS}>
          {t("common.menu.edit")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarCheckboxItem
            checked={isSelectedMine}
            onClick={onMarkAsMine}
            disabled={!hasSelectedContact}
            className={MENUBAR_ITEM_CLASS}
          >
            {t("apps.contacts.menu.markAsMine", { defaultValue: "Mark as Mine" })}
          </MenubarCheckboxItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem
            onClick={onDeleteContact}
            disabled={!hasSelectedContact}
            className={MENUBAR_ITEM_CLASS}
          >
            {t("apps.contacts.menu.deleteContact")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </AppMenuBarShell>
  );
}
