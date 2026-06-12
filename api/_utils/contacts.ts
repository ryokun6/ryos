/**
 * Server-side reader/writer for synced contacts, backed by the Cloud Sync
 * v2 key-value state (`contacts/contact:{id}` + `contacts/me`). Used by AI
 * chat tools; writes broadcast realtime ops to connected clients.
 */

import type { Redis } from "./redis.js";
import type { Contact } from "../../src/utils/contacts.js";
import { normalizeContacts } from "../../src/utils/contacts.js";
import { normalizeDeletionMarkerMap } from "../../src/utils/cloudSyncDeletionMarkers.js";
import type { ContactsSnapshotData } from "../chat/tools/types.js";
import { serializeContactToolRecord } from "../../src/shared/tools/contacts.js";
import { hlcFromTimestamp } from "../../src/shared/sync2/hlc.js";
import type { SyncOp } from "../../src/shared/sync2/types.js";
import {
  readSyncDocsByPrefix,
  SERVER_SYNC_CLIENT_ID,
  writeSyncOpsFromServer,
} from "../sync/v2/_core.js";

const CONTACT_KEY_PREFIX = "contacts/contact:";
const ME_KEY = "contacts/me";

export async function readContactsState(
  redis: Redis,
  username: string
): Promise<ContactsSnapshotData> {
  const docs = await readSyncDocsByPrefix(redis, username, "contacts/");

  const rawContacts: unknown[] = [];
  for (const [key, doc] of Object.entries(docs)) {
    if (key.startsWith(CONTACT_KEY_PREFIX)) {
      rawContacts.push(doc);
    }
  }

  const me = docs[ME_KEY] as { myContactId?: unknown } | undefined;

  return {
    contacts: normalizeContacts(rawContacts),
    myContactId:
      typeof me?.myContactId === "string" ? me.myContactId : null,
    deletedContactIds: normalizeDeletionMarkerMap(undefined),
  };
}

/**
 * Replace the user's contacts with `data`. Contacts absent from `data` are
 * tombstoned (matching the v1 replace semantics used by AI tools).
 */
export async function writeContactsState(
  redis: Redis,
  username: string,
  data: ContactsSnapshotData
): Promise<void> {
  const existingDocs = await readSyncDocsByPrefix(redis, username, "contacts/");
  const now = new Date().toISOString();
  const t = hlcFromTimestamp(now, SERVER_SYNC_CLIENT_ID);

  const nextContacts = normalizeContacts(data?.contacts);
  const seenIds = new Set<string>();
  const ops: SyncOp[] = [];

  for (const contact of nextContacts) {
    if (!contact.id || seenIds.has(contact.id)) continue;
    seenIds.add(contact.id);
    const key = `${CONTACT_KEY_PREFIX}${contact.id}`;
    if (JSON.stringify(existingDocs[key]) === JSON.stringify(contact)) {
      continue;
    }
    ops.push({ k: key, v: contact, t });
  }

  for (const key of Object.keys(existingDocs)) {
    if (!key.startsWith(CONTACT_KEY_PREFIX)) continue;
    const id = key.slice(CONTACT_KEY_PREFIX.length);
    if (!seenIds.has(id)) {
      ops.push({ k: key, del: true, t });
    }
  }

  if (data?.deletedContactIds) {
    for (const [id, deletedAt] of Object.entries(
      normalizeDeletionMarkerMap(data.deletedContactIds)
    )) {
      if (!id || seenIds.has(id)) continue;
      const key = `${CONTACT_KEY_PREFIX}${id}`;
      if (!ops.some((op) => op.k === key)) {
        ops.push({
          k: key,
          del: true,
          t: hlcFromTimestamp(deletedAt, SERVER_SYNC_CLIENT_ID),
        });
      }
    }
  }

  const nextMe = { myContactId: data?.myContactId ?? null };
  if (JSON.stringify(existingDocs[ME_KEY]) !== JSON.stringify(nextMe)) {
    ops.push({ k: ME_KEY, v: nextMe, t });
  }

  if (ops.length > 0) {
    await writeSyncOpsFromServer(redis, username, ops);
  }
}

export function serializeContactForTool(contact: Contact) {
  return serializeContactToolRecord(contact);
}
