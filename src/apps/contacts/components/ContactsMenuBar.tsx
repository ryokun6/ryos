import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import { AppMenuBarMenus } from "@/components/shared/menubar/AppMenuBarMenus";
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
    isWindowsTheme,
    isMacOSTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("contacts");

  return (
    <AppMenuBarShell
      isWindowsTheme={isWindowsTheme}
      isMacOSTheme={isMacOSTheme}
      appId={appId}
      appName={appName}
      isShareDialogOpen={isShareDialogOpen}
      setIsShareDialogOpen={setIsShareDialogOpen}
      helpItemLabel={t("apps.contacts.menu.help")}
      aboutItemLabel={t("apps.contacts.menu.about")}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
    >
      <AppMenuBarMenus
        menus={[
          {
            label: t("common.menu.file"),
            items: [
              {
                type: "action",
                label: t("apps.contacts.menu.newContact"),
                onClick: onNewContact,
              },
              {
                type: "action",
                label: t("apps.contacts.menu.importVCard"),
                onClick: onImport,
              },
              { type: "separator" },
              {
                type: "action",
                label: t("apps.contacts.menu.syncContacts", {
                  defaultValue: "Sync Contacts",
                }),
                onClick: () => requestCloudSyncDomainCheck("contacts"),
              },
              { type: "separator" },
              {
                type: "action",
                label: t("common.menu.close"),
                onClick: onClose,
                shortcutId: "close",
              },
            ],
          },
          {
            label: t("common.menu.edit"),
            items: [
              {
                type: "checkbox",
                label: t("apps.contacts.menu.markAsMine", {
                  defaultValue: "Mark as Mine",
                }),
                checked: isSelectedMine,
                onChange: onMarkAsMine,
                disabled: !hasSelectedContact,
              },
              { type: "separator" },
              {
                type: "action",
                label: t("apps.contacts.menu.deleteContact"),
                onClick: onDeleteContact,
                disabled: !hasSelectedContact,
              },
            ],
          },
        ]}
      />
    </AppMenuBarShell>
  );
}
