import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  type Contact,
  type ContactDraft,
  type ContactImportResult,
  createContactFromDraft,
  findMatchingContact,
  mergeContacts,
  parseVCardText,
  sortContacts,
  updateContactFromDraft,
} from "@/utils/contacts";

export interface ImportContactsResult extends ContactImportResult {
  importedCount: number;
  mergedCount: number;
}

interface ContactsStoreState {
  contacts: Contact[];
  selectedContactId: string | null;
  setSelectedContactId: (id: string | null) => void;
  addContact: (draft?: ContactDraft) => string;
  updateContact: (id: string, draft: ContactDraft) => void;
  deleteContact: (id: string) => void;
  importVCardText: (text: string) => ImportContactsResult;
}

function getNextSelectedId(contacts: Contact[], deletedId: string): string | null {
  const remaining = contacts.filter((contact) => contact.id !== deletedId);
  return remaining[0]?.id ?? null;
}

export const useContactsStore = create<ContactsStoreState>()(
  persist(
    (set, get) => ({
      contacts: [],
      selectedContactId: null,

      setSelectedContactId: (id) => set({ selectedContactId: id }),

      addContact: (draft = {}) => {
        const contact = createContactFromDraft(draft);
        set((state) => ({
          contacts: sortContacts([...state.contacts, contact]),
          selectedContactId: contact.id,
        }));
        return contact.id;
      },

      updateContact: (id, draft) => {
        set((state) => ({
          contacts: sortContacts(
            state.contacts.map((contact) =>
              contact.id === id
                ? updateContactFromDraft(contact, draft)
                : contact
            )
          ),
        }));
      },

      deleteContact: (id) => {
        set((state) => ({
          contacts: state.contacts.filter((contact) => contact.id !== id),
          selectedContactId:
            state.selectedContactId === id
              ? getNextSelectedId(state.contacts, id)
              : state.selectedContactId,
        }));
      },

      importVCardText: (text) => {
        const parsed = parseVCardText(text);
        let importedCount = 0;
        let mergedCount = 0;
        let nextSelectedId: string | null = get().selectedContactId;

        set((state) => {
          const nextContacts = [...state.contacts];

          for (const candidate of parsed.contacts) {
            const existing = findMatchingContact(nextContacts, candidate);

            if (existing) {
              const index = nextContacts.findIndex((contact) => contact.id === existing.id);
              nextContacts[index] = mergeContacts(existing, candidate);
              mergedCount += 1;
              if (!nextSelectedId) {
                nextSelectedId = existing.id;
              }
              continue;
            }

            nextContacts.push(candidate);
            importedCount += 1;
            if (!nextSelectedId) {
              nextSelectedId = candidate.id;
            }
          }

          return {
            contacts: sortContacts(nextContacts),
            selectedContactId: nextSelectedId,
          };
        });

        return {
          ...parsed,
          importedCount,
          mergedCount,
        };
      },
    }),
    {
      name: "contacts-storage",
    }
  )
);
