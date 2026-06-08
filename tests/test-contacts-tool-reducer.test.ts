import { describe, expect, test } from "bun:test";
import {
  applyContactsToolAction,
  hasMeaningfulContactDraft,
  serializeContactToolRecord,
} from "../src/shared/tools/contacts";
import { createShortIdMap } from "../src/shared/tools/idMapping";
import type { ContactsSnapshotData } from "../src/shared/domains/contacts";
import type { Contact } from "../src/utils/contacts";

function contact(id: string, updatedAt: number = 1): Contact {
  return {
    id,
    displayName: `Contact ${id}`,
    firstName: "",
    lastName: "",
    nickname: "",
    organization: "Org",
    title: "Title",
    notes: "Notes",
    emails: [{ id: "email-1", label: "work", value: `${id}@example.com` }],
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

function state(): ContactsSnapshotData {
  return {
    contacts: [contact("a"), contact("b")],
    myContactId: "a",
    deletedContactIds: {},
  };
}

describe("contacts tool shared reducer", () => {
  test("lists and serializes contacts with short ids", () => {
    const result = applyContactsToolAction(state(), {
      action: "list",
      query: "a@example",
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "list") return;

    const idMap = createShortIdMap(
      result.contacts.map((item) => item.id),
      "c"
    );
    expect(result.contacts).toHaveLength(1);
    expect(serializeContactToolRecord(result.contacts[0], idMap).id).toBe("c1");
  });

  test("creates contacts from meaningful draft data", () => {
    const result = applyContactsToolAction(state(), {
      action: "create",
      displayName: "New Person",
      emails: ["new@example.com"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "create") return;
    expect(result.contact.displayName).toBe("New Person");
    expect(result.state.contacts.some((item) => item.id === result.contact.id)).toBe(true);
  });

  test("rejects create/update without meaningful data", () => {
    expect(hasMeaningfulContactDraft({ action: "create" })).toBe(false);
    expect(applyContactsToolAction(state(), { action: "create" })).toEqual({
      ok: false,
      error: "missing_data",
    });
    expect(
      applyContactsToolAction(state(), { action: "update", id: "a" })
    ).toEqual({ ok: false, error: "no_updates" });
  });

  test("updates and deletes contacts with tombstones", () => {
    const updated = applyContactsToolAction(
      state(),
      { action: "update", id: "a", organization: "New Org" },
      { resolvedId: "a" }
    );
    expect(updated.ok).toBe(true);
    if (!updated.ok || updated.kind !== "update") return;
    expect(updated.contact.organization).toBe("New Org");

    const deleted = applyContactsToolAction(updated.state, { action: "delete", id: "a" }, {
      resolvedId: "a",
      deletedAt: "2026-06-07T22:00:00.000Z",
    });
    expect(deleted.ok).toBe(true);
    if (!deleted.ok || deleted.kind !== "delete") return;
    expect(deleted.state.myContactId).toBeNull();
    expect(deleted.state.deletedContactIds).toEqual({
      a: "2026-06-07T22:00:00.000Z",
    });
  });
});
