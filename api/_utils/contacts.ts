import type { Redis } from "./redis.js";
import type { Contact } from "../../src/utils/contacts.js";
import { getContactSummary, normalizeContacts } from "../../src/utils/contacts.js";
import { normalizeDeletionMarkerMap } from "../../src/utils/cloudSyncDeletionMarkers.js";
import type { ContactsSnapshotData } from "../chat/tools/types.js";
import { redisStateKey } from "../sync/_keys.js";
import { writeRedisSyncDomainFromServerTool } from "../sync/_state.js";

export async function readContactsState(
  redis: Redis,
  username: string
): Promise<ContactsSnapshotData> {
  const raw = await redis.get<string | { data?: ContactsSnapshotData }>(
    redisStateKey(username, "contacts")
  );

  if (!raw) {
    return { contacts: [] };
  }

  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return {
    contacts: normalizeContacts(parsed?.data?.contacts),
    myContactId:
      typeof parsed?.data?.myContactId === "string" ? parsed.data.myContactId : null,
    deletedContactIds: normalizeDeletionMarkerMap(parsed?.data?.deletedContactIds),
  };
}

export async function writeContactsState(
  redis: Redis,
  username: string,
  data: ContactsSnapshotData
): Promise<void> {
  await writeRedisSyncDomainFromServerTool(redis, username, "contacts", data);
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
