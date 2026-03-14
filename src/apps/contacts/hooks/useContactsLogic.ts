import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { track } from "@vercel/analytics";
import { CONTACTS_ANALYTICS } from "@/utils/analytics";
import { useShallow } from "zustand/react/shallow";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeStore } from "@/stores/useThemeStore";
import { useContactsStore } from "@/stores/useContactsStore";
import type { Contact, ContactDraft } from "@/utils/contacts";
import { contactMatchesQuery, parseVCardText, sortContacts } from "@/utils/contacts";
import { resizeImageToBase64 } from "@/utils/imageResize";
import { requestCloudSyncCheck } from "@/utils/cloudSyncEvents";
import { helpItems } from "..";

type ContactGroupId = "all" | "imported" | "telegram" | "work" | "birthdays";

interface ContactGroup {
  id: ContactGroupId;
  label: string;
  contacts: Contact[];
}

export function useContactsLogic() {
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("contacts", helpItems);
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOsxTheme = currentTheme === "macosx";
  const isSystem7Theme = currentTheme === "system7";

  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<ContactGroupId>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    contacts,
    selectedContactId,
    myContactId,
    lastRemoteSyncAt,
    setSelectedContactId,
    setMyContactId,
    addContact,
    updateContact,
    deleteContact,
    importContacts,
  } = useContactsStore(
    useShallow((state) => ({
      contacts: state.contacts,
      selectedContactId: state.selectedContactId,
      myContactId: state.myContactId,
      lastRemoteSyncAt: state.lastRemoteSyncAt,
      setSelectedContactId: state.setSelectedContactId,
      setMyContactId: state.setMyContactId,
      addContact: state.addContact,
      updateContact: state.updateContact,
      deleteContact: state.deleteContact,
      importContacts: state.importContacts,
    }))
  );

  const sortedContacts = useMemo(() => sortContacts(contacts, myContactId), [contacts, myContactId]);
  const contactGroups = useMemo<ContactGroup[]>(() => {
    const imported = sortedContacts.filter((contact) => contact.source === "vcard");
    const telegram = sortedContacts.filter(
      (contact) => Boolean(contact.telegramUsername || contact.telegramUserId)
    );
    const work = sortedContacts.filter((contact) =>
      Boolean(contact.organization || contact.title)
    );
    const birthdays = sortedContacts.filter((contact) => Boolean(contact.birthday));

    return [
      {
        id: "all",
        label: t("apps.contacts.groups.all", { defaultValue: "All" }),
        contacts: sortedContacts,
      },
      {
        id: "imported",
        label: t("apps.contacts.groups.imported", { defaultValue: "Imported" }),
        contacts: imported,
      },
      {
        id: "telegram",
        label: t("apps.contacts.groups.telegram", { defaultValue: "Telegram" }),
        contacts: telegram,
      },
      {
        id: "work",
        label: t("apps.contacts.groups.work", { defaultValue: "Work" }),
        contacts: work,
      },
      {
        id: "birthdays",
        label: t("apps.contacts.groups.birthdays", { defaultValue: "Birthdays" }),
        contacts: birthdays,
      },
    ];
  }, [sortedContacts, t]);

  const selectedGroup =
    contactGroups.find((group) => group.id === selectedGroupId) || contactGroups[0];

  const filteredContacts = useMemo(() => {
    const groupContacts = selectedGroup?.contacts || [];
    return searchQuery.trim()
      ? groupContacts.filter((contact) =>
          contactMatchesQuery(contact, searchQuery)
        )
      : groupContacts;
  }, [searchQuery, selectedGroup]);

  const selectedContact = useMemo(
    () =>
      filteredContacts.find((contact) => contact.id === selectedContactId) ||
      filteredContacts[0] ||
      null,
    [filteredContacts, selectedContactId]
  );

  useEffect(() => {
    requestCloudSyncCheck();
  }, []);

  useEffect(() => {
    const hasSelectedContact = filteredContacts.some(
      (contact) => contact.id === selectedContactId
    );

    if ((!selectedContactId || !hasSelectedContact) && filteredContacts[0]) {
      setSelectedContactId(filteredContacts[0].id);
    }
  }, [filteredContacts, selectedContactId, setSelectedContactId]);

  const handleCreateContact = () => {
    setSelectedGroupId("all");
    const id = addContact({ source: "manual" });
    setSelectedContactId(id);
    track(CONTACTS_ANALYTICS.CONTACT_CREATE);
  };

  const handleDeleteSelectedContact = () => {
    if (!selectedContact) {
      return;
    }
    deleteContact(selectedContact.id);
    track(CONTACTS_ANALYTICS.CONTACT_DELETE);
    toast.success(
      t("apps.contacts.messages.deleted", {
        name: selectedContact.displayName,
      })
    );
  };

  const handleSelectContact = (contact: Contact) => {
    setSelectedContactId(contact.id);
  };

  const handleSelectGroup = (groupId: ContactGroupId) => {
    setSelectedGroupId(groupId);
  };

  const handleMarkAsMine = () => {
    if (!selectedContact) return;
    setMyContactId(
      myContactId === selectedContact.id ? null : selectedContact.id
    );
  };

  const updateSelectedContact = (draft: ContactDraft) => {
    if (!selectedContact) {
      return;
    }
    updateContact(selectedContact.id, draft);
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseVCardText(text);

      for (const contact of parsed.contacts) {
        if (contact.picture) {
          const originalPicture = contact.picture;
          try {
            contact.picture = await resizeImageToBase64(originalPicture, 64);
          } catch {
            contact.picture = originalPicture;
          }
        }
      }

      const result = importContacts(parsed);

      if (result.contacts.length === 0) {
        toast.error(t("apps.contacts.messages.importEmpty"));
        return;
      }

      toast.success(
        t("apps.contacts.messages.imported", {
          imported: result.importedCount,
          merged: result.mergedCount,
        })
      );

      if (result.warnings.length > 0) {
        toast.info(result.warnings[0]);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("apps.contacts.messages.importFailed")
      );
    }
  };

  return {
    t,
    translatedHelpItems,
    isXpTheme,
    isMacOsxTheme,
    isSystem7Theme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    searchQuery,
    setSearchQuery,
    selectedGroupId,
    contactGroups,
    contacts: filteredContacts,
    totalContacts: sortedContacts.length,
    selectedContact,
    handleSelectGroup,
    handleSelectContact,
    handleCreateContact,
    handleDeleteSelectedContact,
    handleMarkAsMine,
    myContactId,
    lastRemoteSyncAt,
    updateSelectedContact,
    handleImport,
    handleFileSelected,
    fileInputRef,
  };
}
