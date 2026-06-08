import { describe, expect, test } from "bun:test";
import {
  mergeContactsSnapshots,
  normalizeContactsSnapshotData,
} from "../src/shared/domains/contacts";
import type { Contact } from "../src/utils/contacts";

const oldDeletedAt = "2026-01-01T00:00:00.000Z";
const newDeletedAt = "2026-01-02T00:00:00.000Z";

function contact(id: string, updatedAt: number): Contact {
  return {
    id,
    displayName: id,
    firstName: "",
    lastName: "",
    nickname: "",
    organization: "",
    title: "",
    notes: "",
    emails: [],
    phones: [],
    addresses: [],
    urls: [],
    birthday: null,
    telegramUsername: "",
    telegramUserId: "",
    picture: null,
    source: "manual",
    createdAt: 1,
    updatedAt,
  };
}

describe("normalizeContactsSnapshotData", () => {
  test("defaults invalid snapshots", () => {
    expect(normalizeContactsSnapshotData(null)).toEqual({
      contacts: [],
      myContactId: null,
      deletedContactIds: {},
    });
  });

  test("normalizes contacts and tombstones", () => {
    expect(
      normalizeContactsSnapshotData({
        contacts: [contact("a", 1), { id: "bad" }],
        myContactId: "a",
        deletedContactIds: { b: oldDeletedAt, bad: 1 },
      })
    ).toEqual({
      contacts: [contact("a", 1)],
      myContactId: "a",
      deletedContactIds: { b: oldDeletedAt },
    });
  });
});

describe("mergeContactsSnapshots", () => {
  test("prefers newer contacts and preserves local myContactId", () => {
    const merged = mergeContactsSnapshots(
      {
        contacts: [contact("same", 20)],
        myContactId: "same",
        deletedContactIds: {},
      },
      {
        contacts: [contact("same", 10), contact("remote", 5)],
        myContactId: "remote",
        deletedContactIds: {},
      }
    );

    expect(merged.contacts.map((item) => [item.id, item.updatedAt])).toEqual([
      ["same", 20],
      ["remote", 5],
    ]);
    expect(merged.myContactId).toBe("same");
  });

  test("filters contacts deleted by newest tombstone", () => {
    const merged = mergeContactsSnapshots(
      {
        contacts: [contact("gone", 20)],
        myContactId: null,
        deletedContactIds: { gone: oldDeletedAt },
      },
      {
        contacts: [contact("gone", 30)],
        myContactId: null,
        deletedContactIds: { gone: newDeletedAt },
      }
    );

    expect(merged.contacts).toEqual([]);
    expect(merged.deletedContactIds).toEqual({ gone: newDeletedAt });
  });
});
