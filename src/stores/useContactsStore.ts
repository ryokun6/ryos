import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  type Contact,
  type ContactDraft,
  type ContactImportResult,
  DEFAULT_RYO_CONTACT_DRAFT,
  createContactFromDraft,
  findMatchingContact,
  mergeContacts,
  normalizeContacts,
  parseVCardText,
  seedDefaultContacts,
  sortContacts,
  updateContactFromDraft,
} from "@/utils/contacts";
import type {
  GoogleContactsDeletionInput,
  GoogleContactsSyncResponse,
} from "@/shared/contracts/google";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import { createIndexedDBPersistStorage } from "@/utils/indexedDBPersistStorage";
import { LEGACY_STORAGE_KEYS, STORAGE_KEYS } from "@/utils/storageKeys";

export interface ImportContactsResult extends ContactImportResult {
  importedCount: number;
  mergedCount: number;
}

interface ContactsStoreState {
  contacts: Contact[];
  selectedContactId: string | null;
  myContactId: string | null;
  suppressDefaultSeed: boolean;
  pendingGoogleDeletions: GoogleContactsDeletionInput[];
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
    myContactId?: string | null,
    suppressDefaultSeed?: boolean
  ) => void;
  discardAllLocalContactsForGoogleSync: () => string[];
  applyGoogleContactsSyncResult: (response: GoogleContactsSyncResponse) => void;
  detachGoogleContactsMetadata: () => void;
}

function getNextSelectedId(contacts: Contact[], deletedId: string): string | null {
  const remaining = contacts.filter((contact) => contact.id !== deletedId);
  return remaining[0]?.id ?? null;
}

function isDefaultRyoContact(contact: Contact): boolean {
  const firstEmail = DEFAULT_RYO_CONTACT_DRAFT.emails?.[0];
  const defaultEmail = (
    typeof firstEmail === "string" ? firstEmail : firstEmail?.value
  )?.toLowerCase();
  if (
    defaultEmail &&
    contact.emails.some((entry) => entry.value.toLowerCase() === defaultEmail)
  ) {
    return true;
  }
  return (
    contact.firstName.toLowerCase() === "ryo" &&
    contact.lastName.toLowerCase() === "lu"
  );
}

function areContactListsEqual(a: Contact[], b: Contact[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) {
      return false;
    }
  }
  return true;
}

export function dedupeContactsByGoogleResource(contacts: Contact[]): {
  contacts: Contact[];
  removedDuplicateIds: string[];
} {
  const byResource = new Map<string, Contact>();
  const removedDuplicateIds: string[] = [];
  const passthrough: Contact[] = [];

  for (const contact of contacts) {
    if (!contact.googleResourceName) {
      passthrough.push(contact);
      continue;
    }
    const existing = byResource.get(contact.googleResourceName);
    if (!existing) {
      byResource.set(contact.googleResourceName, contact);
      continue;
    }
    if (contact.updatedAt > existing.updatedAt) {
      removedDuplicateIds.push(existing.id);
      byResource.set(contact.googleResourceName, contact);
    } else {
      removedDuplicateIds.push(contact.id);
    }
  }

  return {
    contacts: [...passthrough, ...byResource.values()],
    removedDuplicateIds,
  };
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
      suppressDefaultSeed: false,
      pendingGoogleDeletions: [],
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
        const existing = get().contacts.find((contact) => contact.id === id);
        set((state) => {
          const nextPending =
            existing?.googleResourceName &&
            !state.pendingGoogleDeletions.some(
              (d) => d.googleResourceName === existing.googleResourceName
            )
              ? [
                  ...state.pendingGoogleDeletions,
                  {
                    localId: existing.id,
                    googleResourceName: existing.googleResourceName,
                  },
                ]
              : state.pendingGoogleDeletions;
          return {
            contacts: state.contacts.filter((contact) => contact.id !== id),
            selectedContactId:
              state.selectedContactId === id
                ? getNextSelectedId(state.contacts, id)
                : state.selectedContactId,
            myContactId: state.myContactId === id ? null : state.myContactId,
            suppressDefaultSeed:
              state.suppressDefaultSeed ||
              (existing ? isDefaultRyoContact(existing) : false) ||
              state.contacts.length <= 1,
            pendingGoogleDeletions: nextPending,
          };
        });
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

      replaceContactsFromSync: (
        incomingContacts,
        incomingMyContactId = null,
        incomingSuppressDefaultSeed
      ) => {
        let removedDuplicateIds: string[] = [];
        set((state) => {
          const normalized = normalizeContacts(incomingContacts);
          const deduped = dedupeContactsByGoogleResource(normalized);
          removedDuplicateIds = deduped.removedDuplicateIds;
          const contacts = sortContacts(deduped.contacts, incomingMyContactId);
          const selectedContactId = contacts.some(
            (contact) => contact.id === state.selectedContactId
          )
            ? state.selectedContactId
            : contacts[0]?.id ?? null;
          const myContactId = contacts.some((contact) => contact.id === incomingMyContactId)
            ? incomingMyContactId
            : null;
          const suppressDefaultSeed =
            typeof incomingSuppressDefaultSeed === "boolean"
              ? incomingSuppressDefaultSeed
              : state.suppressDefaultSeed;

          return {
            contacts,
            selectedContactId,
            myContactId,
            suppressDefaultSeed,
            lastRemoteSyncAt: Date.now(),
          };
        });

        if (removedDuplicateIds.length > 0) {
          useCloudSyncStore
            .getState()
            .markDeletedKeys("contactIds", removedDuplicateIds);
        }
      },

      discardAllLocalContactsForGoogleSync: () => {
        const deletedIds = get().contacts.map((c) => c.id);
        set({
          contacts: [],
          selectedContactId: null,
          myContactId: null,
          suppressDefaultSeed: true,
          pendingGoogleDeletions: [],
        });
        if (deletedIds.length > 0) {
          useCloudSyncStore.getState().markDeletedKeys("contactIds", deletedIds);
        }
        return deletedIds;
      },

      applyGoogleContactsSyncResult: (response) => {
        const removedLocalIds: string[] = [];
        const upsertedLocalIds: string[] = [];

        set((state) => {
          const ackedDeleteLocalIds = new Set(response.deletedLocalIds);
          const remoteDeletedSet = new Set(response.remoteDeletedResourceNames);
          const nextPendingDeletions = state.pendingGoogleDeletions.filter(
            (d) =>
              !ackedDeleteLocalIds.has(d.localId) &&
              !remoteDeletedSet.has(d.googleResourceName)
          );
          const pendingResources = new Set(
            nextPendingDeletions.map((d) => d.googleResourceName)
          );

          const pushedById = new Map(
            response.pushed.map((item) => [item.localId, item.contact])
          );
          const remoteUpsertsFiltered = response.remoteUpserts.filter(
            (c) =>
              !c.googleResourceName || !pendingResources.has(c.googleResourceName)
          );
          const remoteResourceNames = new Set(
            remoteUpsertsFiltered
              .map((c) => c.googleResourceName)
              .filter((rn): rn is string => Boolean(rn))
          );

          const surviving: Contact[] = [];
          for (const contact of state.contacts) {
            if (
              contact.googleResourceName &&
              remoteDeletedSet.has(contact.googleResourceName)
            ) {
              removedLocalIds.push(contact.id);
              continue;
            }
            if (
              response.fullSync &&
              contact.googleResourceName &&
              !remoteResourceNames.has(contact.googleResourceName) &&
              !pushedById.has(contact.id)
            ) {
              const hasUnsyncedLocalEdit =
                contact.googleSyncedUpdatedAt !== undefined
                  ? contact.updatedAt > contact.googleSyncedUpdatedAt
                  : false;
              if (!hasUnsyncedLocalEdit) {
                removedLocalIds.push(contact.id);
                continue;
              }
            }

            const pushed = pushedById.get(contact.id);
            if (pushed) {
              if (contact.updatedAt > pushed.updatedAt) {
                surviving.push({
                  ...contact,
                  googleResourceName: pushed.googleResourceName,
                  googleEtag: pushed.googleEtag,
                  googleSyncedUpdatedAt: pushed.googleSyncedUpdatedAt,
                });
              } else {
                surviving.push({
                  ...pushed,
                  picture: contact.picture || pushed.picture,
                  telegramUsername:
                    contact.telegramUsername || pushed.telegramUsername,
                  telegramUserId:
                    contact.telegramUserId || pushed.telegramUserId,
                });
              }
            } else {
              surviving.push(contact);
            }
          }

          const byId = new Map<string, Contact>();
          const idByResource = new Map<string, string>();
          for (const contact of surviving) {
            byId.set(contact.id, contact);
            if (contact.googleResourceName) {
              idByResource.set(contact.googleResourceName, contact.id);
            }
          }

          for (const remote of remoteUpsertsFiltered) {
            const existingId =
              (byId.has(remote.id) ? remote.id : undefined) ??
              (remote.googleResourceName
                ? idByResource.get(remote.googleResourceName)
                : undefined);
            const existing = existingId ? byId.get(existingId) : undefined;

            if (existing) {
              const hasUnsyncedLocalEdit =
                existing.googleSyncedUpdatedAt !== undefined
                  ? existing.updatedAt > existing.googleSyncedUpdatedAt
                  : false;
              if (hasUnsyncedLocalEdit && existing.updatedAt > remote.updatedAt) {
                byId.set(existing.id, {
                  ...existing,
                  googleResourceName:
                    remote.googleResourceName ?? existing.googleResourceName,
                  googleEtag: remote.googleEtag ?? existing.googleEtag,
                });
              } else {
                byId.set(existing.id, {
                  ...remote,
                  id: existing.id,
                  picture: remote.picture || existing.picture,
                  telegramUsername:
                    existing.telegramUsername || remote.telegramUsername,
                  telegramUserId:
                    existing.telegramUserId || remote.telegramUserId,
                  googleSyncedUpdatedAt: remote.updatedAt,
                });
              }
            } else {
              const inserted: Contact = {
                ...remote,
                googleSyncedUpdatedAt: remote.updatedAt,
              };
              byId.set(inserted.id, inserted);
              if (inserted.googleResourceName) {
                idByResource.set(inserted.googleResourceName, inserted.id);
              }
              upsertedLocalIds.push(inserted.id);
            }
          }

          const myContactId =
            state.myContactId && byId.has(state.myContactId)
              ? state.myContactId
              : null;
          const nextContacts = sortContacts(Array.from(byId.values()), myContactId);
          const selectedContactId =
            state.selectedContactId &&
            nextContacts.some((c) => c.id === state.selectedContactId)
              ? state.selectedContactId
              : nextContacts[0]?.id ?? null;

          const contactsChanged = !areContactListsEqual(
            state.contacts,
            nextContacts
          );
          const deletionsChanged =
            state.pendingGoogleDeletions.length !== nextPendingDeletions.length ||
            state.pendingGoogleDeletions.some(
              (d, idx) =>
                d.localId !== nextPendingDeletions[idx]?.localId ||
                d.googleResourceName !== nextPendingDeletions[idx]?.googleResourceName
            );
          const selectionChanged =
            selectedContactId !== state.selectedContactId ||
            myContactId !== state.myContactId;

          if (!contactsChanged && !deletionsChanged && !selectionChanged) {
            return state;
          }

          return {
            ...(contactsChanged ? { contacts: nextContacts } : {}),
            ...(deletionsChanged
              ? { pendingGoogleDeletions: nextPendingDeletions }
              : {}),
            selectedContactId,
            myContactId,
          };
        });

        if (removedLocalIds.length > 0) {
          useCloudSyncStore
            .getState()
            .markDeletedKeys("contactIds", removedLocalIds);
        }
        if (upsertedLocalIds.length > 0) {
          useCloudSyncStore
            .getState()
            .clearDeletedKeys("contactIds", upsertedLocalIds);
        }
      },

      detachGoogleContactsMetadata: () => {
        set((state) => ({
          pendingGoogleDeletions: [],
          contacts: state.contacts.map((contact) => {
            if (
              !contact.googleResourceName &&
              !contact.googleEtag &&
              contact.googleSyncedUpdatedAt === undefined
            ) {
              return contact;
            }
            const {
              googleResourceName: _rn,
              googleEtag: _etag,
              googleSyncedUpdatedAt: _gsync,
              ...rest
            } = contact;
            return rest;
          }),
        }));
      },
    }),
    {
      name: STORAGE_KEYS.contacts,
      storage: createIndexedDBPersistStorage({
        legacyNames: [LEGACY_STORAGE_KEYS.contacts],
      }),
      partialize: (state) => ({
        contacts: state.contacts,
        selectedContactId: state.selectedContactId,
        myContactId: state.myContactId,
        suppressDefaultSeed: state.suppressDefaultSeed,
        pendingGoogleDeletions: state.pendingGoogleDeletions,
        lastRemoteSyncAt: state.lastRemoteSyncAt,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<ContactsStoreState> | undefined;
        const suppressDefaultSeed = persisted?.suppressDefaultSeed === true;
        const rawContacts = Array.isArray(persisted?.contacts)
          ? persisted.contacts
          : [];
        const rawMyContactId =
          typeof persisted?.myContactId === "string"
            ? persisted.myContactId
            : null;
        const contacts = suppressDefaultSeed
          ? sortContacts(normalizeContacts(rawContacts), rawMyContactId)
          : seedDefaultContacts(rawContacts);

        const selectedContactId =
          typeof persisted?.selectedContactId === "string" &&
          contacts.some((contact) => contact.id === persisted.selectedContactId)
            ? persisted.selectedContactId
            : contacts[0]?.id ?? null;

        const myContactId =
          rawMyContactId && contacts.some((contact) => contact.id === rawMyContactId)
            ? rawMyContactId
            : null;

        return {
          ...currentState,
          contacts,
          selectedContactId,
          myContactId,
          suppressDefaultSeed,
          pendingGoogleDeletions: Array.isArray(persisted?.pendingGoogleDeletions)
            ? persisted.pendingGoogleDeletions
            : [],
          lastRemoteSyncAt:
            typeof persisted?.lastRemoteSyncAt === "number"
              ? persisted.lastRemoteSyncAt
              : 0,
        };
      },
    }
  )
);
