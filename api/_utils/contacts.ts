import type { Redis } from "./redis.js";
import type { Contact } from "../../src/utils/contacts.js";
import { normalizeContacts } from "../../src/utils/contacts.js";
import { normalizeDeletionMarkerMap } from "../../src/utils/cloudSyncDeletionMarkers.js";
import type { ContactsSnapshotData } from "../chat/tools/types.js";
import { serializeContactToolRecord } from "../../src/shared/tools/contacts.js";
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
  return serializeContactToolRecord(contact);
}
