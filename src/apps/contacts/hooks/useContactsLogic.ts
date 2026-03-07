import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeStore } from "@/stores/useThemeStore";
import { useContactsStore } from "@/stores/useContactsStore";
import type { Contact, ContactDraft } from "@/utils/contacts";
import { contactMatchesQuery, sortContacts } from "@/utils/contacts";
import { helpItems } from "..";

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    contacts,
    selectedContactId,
    setSelectedContactId,
    addContact,
    updateContact,
    deleteContact,
    importVCardText,
  } = useContactsStore(
    useShallow((state) => ({
      contacts: state.contacts,
      selectedContactId: state.selectedContactId,
      setSelectedContactId: state.setSelectedContactId,
      addContact: state.addContact,
      updateContact: state.updateContact,
      deleteContact: state.deleteContact,
      importVCardText: state.importVCardText,
    }))
  );

  const sortedContacts = useMemo(() => sortContacts(contacts), [contacts]);
  const filteredContacts = useMemo(() => {
    return searchQuery.trim()
      ? sortedContacts.filter((contact) =>
          contactMatchesQuery(contact, searchQuery)
        )
      : sortedContacts;
  }, [searchQuery, sortedContacts]);

  const selectedContact = useMemo(
    () =>
      filteredContacts.find((contact) => contact.id === selectedContactId) ||
      filteredContacts[0] ||
      null,
    [filteredContacts, selectedContactId]
  );

  useEffect(() => {
    const hasSelectedContact = filteredContacts.some(
      (contact) => contact.id === selectedContactId
    );

    if ((!selectedContactId || !hasSelectedContact) && filteredContacts[0]) {
      setSelectedContactId(filteredContacts[0].id);
    }
  }, [filteredContacts, selectedContactId, setSelectedContactId]);

  const handleCreateContact = () => {
    const id = addContact({ source: "manual" });
    setSelectedContactId(id);
  };

  const handleDeleteSelectedContact = () => {
    if (!selectedContact) {
      return;
    }
    deleteContact(selectedContact.id);
    toast.success(
      t("apps.contacts.messages.deleted", {
        name: selectedContact.displayName,
      })
    );
  };

  const handleSelectContact = (contact: Contact) => {
    setSelectedContactId(contact.id);
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
      const result = importVCardText(text);

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
    contacts: filteredContacts,
    selectedContact,
    handleSelectContact,
    handleCreateContact,
    handleDeleteSelectedContact,
    updateSelectedContact,
    handleImport,
    handleFileSelected,
    fileInputRef,
  };
}
