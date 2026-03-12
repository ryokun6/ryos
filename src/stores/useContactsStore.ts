import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  type Contact,
  type ContactDraft,
  type ContactImportResult,
  createContactFromDraft,
  findMatchingContact,
  mergeContacts,
  normalizeContacts,
  parseVCardText,
  seedDefaultContacts,
  sortContacts,
  updateContactFromDraft,
} from "@/utils/contacts";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";

export interface ImportContactsResult extends ContactImportResult {
  importedCount: number;
  mergedCount: number;
}

interface ContactsStoreState {
  contacts: Contact[];
  selectedContactId: string | null;
  myContactId: string | null;
  lastRemoteSyncAt: number;
  setSelectedContactId: (id: string | null) => void;
  setMyContactId: (id: string | null) => void;
  addContact: (draft?: ContactDraft) => string;
  updateContact: (id: string, draft: ContactDraft) => void;
  deleteContact: (id: string) => void;
  importContacts: (parsed: ContactImportResult) => ImportContactsResult;
  importVCardText: (text: string) => ImportContactsResult;
  replaceContactsFromSync: (
    contacts: Contact[],
    myContactId?: string | null
  ) => void;
}

function getNextSelectedId(contacts: Contact[], deletedId: string): string | null {
  const remaining = contacts.filter((contact) => contact.id !== deletedId);
  return remaining[0]?.id ?? null;
}

function createInitialSeededContacts(): Contact[] {
  return seedDefaultContacts([]);
}

const INITIAL_CONTACTS = createInitialSeededContacts();

export const useContactsStore = create<ContactsStoreState>()(
  persist(
    (set, get) => ({
      contacts: INITIAL_CONTACTS,
      selectedContactId: INITIAL_CONTACTS[0]?.id ?? null,
      myContactId: null,
      lastRemoteSyncAt: 0,

      setSelectedContactId: (id) => set({ selectedContactId: id }),
      setMyContactId: (id) => set((state) => ({
        myContactId: id,
        contacts: sortContacts(state.contacts, id),
      })),

      addContact: (draft = {}) => {
        const contact = createContactFromDraft(draft);
        set((state) => ({
          contacts: sortContacts([...state.contacts, contact], state.myContactId),
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
            ),
            state.myContactId
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
          myContactId: state.myContactId === id ? null : state.myContactId,
        }));
        useCloudSyncStore.getState().markDeletedKeys("contactIds", [id]);
      },

      importContacts: (parsed) => {
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
            contacts: sortContacts(nextContacts, state.myContactId),
            selectedContactId: nextSelectedId,
          };
        });

        return {
          ...parsed,
          importedCount,
          mergedCount,
        };
      },

      importVCardText: (text) => {
        return get().importContacts(parseVCardText(text));
      },

      replaceContactsFromSync: (incomingContacts, incomingMyContactId = null) => {
        set((state) => {
          const contacts = sortContacts(normalizeContacts(incomingContacts), incomingMyContactId);
          const selectedContactId = contacts.some(
            (contact) => contact.id === state.selectedContactId
          )
            ? state.selectedContactId
            : contacts[0]?.id ?? null;
          const myContactId = contacts.some((contact) => contact.id === incomingMyContactId)
            ? incomingMyContactId
            : null;

          return {
            contacts,
            selectedContactId,
            myContactId,
            lastRemoteSyncAt: Date.now(),
          };
        });
      },
    }),
    {
      name: "contacts-storage",
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<ContactsStoreState> | undefined;
        const contacts = seedDefaultContacts(
          Array.isArray(persisted?.contacts) ? persisted.contacts : []
        );

        const selectedContactId =
          typeof persisted?.selectedContactId === "string" &&
          contacts.some((contact) => contact.id === persisted.selectedContactId)
            ? persisted.selectedContactId
            : contacts[0]?.id ?? null;

        const myContactId =
          typeof persisted?.myContactId === "string" &&
          contacts.some((contact) => contact.id === persisted.myContactId)
            ? persisted.myContactId
            : null;

        return {
          ...currentState,
          contacts,
          selectedContactId,
          myContactId,
          lastRemoteSyncAt:
            typeof persisted?.lastRemoteSyncAt === "number" ? persisted.lastRemoteSyncAt : 0,
        };
      },
    }
  )
);
