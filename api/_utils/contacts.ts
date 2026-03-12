import type { Redis } from "./redis.js";
import type { Contact } from "../../src/utils/contacts.js";
import { getContactSummary, normalizeContacts } from "../../src/utils/contacts.js";
import type { ContactsSnapshotData } from "../chat/tools/types.js";
import { stateKey } from "../sync/state.js";

function metaKey(username: string): string {
  return `sync:state:meta:${username}`;
}

export async function readContactsState(
  redis: Redis,
  username: string
): Promise<ContactsSnapshotData> {
  const raw = await redis.get<string | { data?: ContactsSnapshotData }>(
    stateKey(username, "contacts")
  );

  if (!raw) {
    return { contacts: [] };
  }

  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  const data = parsed?.data as ContactsSnapshotData | undefined;
  return {
    contacts: normalizeContacts(data?.contacts),
    myContactId: typeof data?.myContactId === "string" ? data.myContactId : null,
  };
}

export async function writeContactsState(
  redis: Redis,
  username: string,
  data: ContactsSnapshotData
): Promise<void> {
  const now = new Date().toISOString();
  const key = stateKey(username, "contacts");

  await redis.set(
    key,
    JSON.stringify({
      data,
      updatedAt: now,
      version: 1,
      createdAt: now,
    })
  );

  const existingMeta = await redis.get<string | Record<string, unknown>>(metaKey(username));
  const metadata =
    typeof existingMeta === "string"
      ? JSON.parse(existingMeta)
      : existingMeta || {};

  metadata.contacts = {
    updatedAt: now,
    version: 1,
    createdAt: now,
  };

  await redis.set(metaKey(username), JSON.stringify(metadata));
}

export function serializeContactForTool(contact: Contact) {
  return {
    id: contact.id,
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
