import { MenuBar } from "@/components/layout/MenuBar";
import {
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { useThemeFlags } from "@/hooks/useThemeFlags";
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
  const { isWindowsTheme: isXpTheme, isMacOSTheme: isMacOsxTheme } =
    useThemeFlags();

  return (
    <MenuBar inWindowFrame={isXpTheme}>
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem onClick={onNewContact} className="text-md h-6 px-3">
            {t("apps.contacts.menu.newContact")}
          </MenubarItem>
          <MenubarItem onClick={onImport} className="text-md h-6 px-3">
            {t("apps.contacts.menu.importVCard")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem onClick={() => requestCloudSyncDomainCheck("contacts")} className="text-md h-6 px-3">
            {t("apps.contacts.menu.syncContacts", { defaultValue: "Sync Contacts" })}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem onClick={onClose} className="text-md h-6 px-3">
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.edit")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarCheckboxItem
            checked={isSelectedMine}
            onClick={onMarkAsMine}
            disabled={!hasSelectedContact}
            className="text-md h-6 px-3"
          >
            {t("apps.contacts.menu.markAsMine", { defaultValue: "Mark as Mine" })}
          </MenubarCheckboxItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onDeleteContact}
            disabled={!hasSelectedContact}
            className="text-md h-6 px-3"
          >
            {t("apps.contacts.menu.deleteContact")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem onClick={onShowHelp} className="text-md h-6 px-3">
            {t("apps.contacts.menu.help")}
          </MenubarItem>
          {!isMacOsxTheme && (
            <>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarItem onClick={onShowAbout} className="text-md h-6 px-3">
                {t("apps.contacts.menu.about")}
              </MenubarItem>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>
    </MenuBar>
  );
}
