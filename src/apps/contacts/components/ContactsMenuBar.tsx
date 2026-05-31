import { MenuBar } from "@/components/layout/MenuBar";
import {
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { AppMenuBarHelpMenu } from "@/components/shared/menubar/AppMenuBarHelpMenu";
import { AppShareItemDialog } from "@/components/shared/menubar/AppShareItemDialog";
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
    <MenuBar inWindowFrame={isXpTheme}>
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

      <AppMenuBarHelpMenu
        helpItemLabel={t("apps.contacts.menu.help")}
        aboutItemLabel={t("apps.contacts.menu.about")}
        isMacOsxTheme={isMacOsxTheme}
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
