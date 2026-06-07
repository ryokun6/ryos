import {
  contactMatchesQuery,
  createContactFromDraft,
  getContactSummary,
  sortContacts,
  updateContactFromDraft,
  type Contact,
  type ContactDraft,
} from "../../utils/contacts";
import type { ContactsSnapshotData } from "../domains/contacts";
import type { ShortIdMap } from "./idMapping";

export const CONTACT_ACTIONS = ["list", "get", "create", "update", "delete"] as const;
export type ContactsAction = (typeof CONTACT_ACTIONS)[number];

export interface ContactsControlInput {
  action: ContactsAction;
  id?: string;
  query?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
  organization?: string;
  title?: string;
  notes?: string;
  emails?: string[];
  phones?: string[];
  urls?: string[];
  addresses?: string[];
  birthday?: string | null;
  telegramUsername?: string | null;
  telegramUserId?: string | null;
}

export interface ContactToolRecord {
  id: string;
  displayName: string;
  organization: string;
  title: string;
  emails: string[];
  phones: string[];
  urls: string[];
  addresses: string[];
  telegramUsername: string | null;
  telegramUserId: string | null;
  birthday: string | null;
  notes?: string | null;
  summary?: string | null;
}

export interface ContactsControlOutput {
  success: boolean;
  message: string;
  contacts?: ContactToolRecord[];
  contact?: ContactToolRecord | null;
}

export type ContactsToolError =
  | "missing_id"
  | "not_found"
  | "missing_data"
  | "no_updates"
  | "unknown_action";

export type ContactsToolResult =
  | {
      ok: true;
      state: ContactsSnapshotData;
      kind: "list";
      contacts: Contact[];
    }
  | {
      ok: true;
      state: ContactsSnapshotData;
      kind: "get" | "create" | "update";
      contact: Contact;
    }
  | {
      ok: true;
      state: ContactsSnapshotData;
      kind: "delete";
      contact: Contact;
    }
  | {
      ok: false;
      error: ContactsToolError;
      id?: string;
    };

export function contactsInputToDraft(input: ContactsControlInput): ContactDraft {
  return {
    displayName: input.displayName,
    firstName: input.firstName,
    lastName: input.lastName,
    nickname: input.nickname,
    organization: input.organization,
    title: input.title,
    notes: input.notes,
    emails: input.emails,
    phones: input.phones,
    urls: input.urls,
    addresses: input.addresses,
    birthday: input.birthday,
    telegramUsername: input.telegramUsername,
    telegramUserId: input.telegramUserId,
    source: "ai",
  };
}

export function hasMeaningfulContactDraft(input: ContactsControlInput): boolean {
  return Boolean(
    input.displayName ||
      input.firstName ||
      input.lastName ||
      input.nickname ||
      input.organization ||
      input.title ||
      input.notes ||
      input.telegramUsername ||
      input.telegramUserId ||
      input.birthday ||
      input.emails?.length ||
      input.phones?.length ||
      input.urls?.length ||
      input.addresses?.length
  );
}

export function serializeContactToolRecord(
  contact: Contact,
  idMap?: ShortIdMap
): ContactToolRecord {
  return {
    id: idMap?.fullToShort.get(contact.id) || contact.id,
    displayName: contact.displayName,
    organization: contact.organization,
    title: contact.title,
    emails: contact.emails.map((item) => item.value),
    phones: contact.phones.map((item) => item.value),
    urls: contact.urls.map((item) => item.value),
    addresses: contact.addresses.map((item) => item.formatted),
    telegramUsername: contact.telegramUsername || null,
    telegramUserId: contact.telegramUserId || null,
    birthday: contact.birthday,
    notes: contact.notes || null,
    summary: getContactSummary(contact) || null,
  };
}

export function applyContactsToolAction(
  state: ContactsSnapshotData,
  input: ContactsControlInput,
  options: {
    resolvedId?: string;
    deletedAt?: string;
  } = {}
): ContactsToolResult {
  switch (input.action) {
    case "list": {
      const contacts = input.query
        ? state.contacts.filter((contact) =>
            contactMatchesQuery(contact, input.query || "")
          )
        : state.contacts;
      return { ok: true, state, kind: "list", contacts };
    }

    case "get": {
      if (!input.id) return { ok: false, error: "missing_id" };
      const id = options.resolvedId || input.id;
      const contact = state.contacts.find((item) => item.id === id);
      if (!contact) return { ok: false, error: "not_found", id: input.id };
      return { ok: true, state, kind: "get", contact };
    }

    case "create": {
      if (!hasMeaningfulContactDraft(input)) {
        return { ok: false, error: "missing_data" };
      }
      const contact = createContactFromDraft(contactsInputToDraft(input));
      return {
        ok: true,
        state: {
          ...state,
          contacts: sortContacts([...state.contacts, contact], state.myContactId),
        },
        kind: "create",
        contact,
      };
    }

    case "update": {
      if (!input.id) return { ok: false, error: "missing_id" };
      if (!hasMeaningfulContactDraft(input)) {
        return { ok: false, error: "no_updates" };
      }
      const id = options.resolvedId || input.id;
      const index = state.contacts.findIndex((item) => item.id === id);
      if (index === -1) return { ok: false, error: "not_found", id: input.id };
      const updated = updateContactFromDraft(
        state.contacts[index],
        contactsInputToDraft(input)
      );
      const nextContacts = [...state.contacts];
      nextContacts[index] = updated;
      return {
        ok: true,
        state: {
          ...state,
          contacts: sortContacts(nextContacts, state.myContactId),
        },
        kind: "update",
        contact: updated,
      };
    }

    case "delete": {
      if (!input.id) return { ok: false, error: "missing_id" };
      const id = options.resolvedId || input.id;
      const contact = state.contacts.find((item) => item.id === id);
      if (!contact) return { ok: false, error: "not_found", id: input.id };
      return {
        ok: true,
        state: {
          ...state,
          contacts: state.contacts.filter((item) => item.id !== id),
          myContactId: state.myContactId === id ? null : state.myContactId,
          deletedContactIds: {
            ...(state.deletedContactIds || {}),
            ...(options.deletedAt ? { [id]: options.deletedAt } : {}),
          },
        },
        kind: "delete",
        contact,
      };
    }

    default:
      return { ok: false, error: "unknown_action" };
  }
}
