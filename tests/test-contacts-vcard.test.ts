import { describe, expect, test } from "bun:test";
import {
  createDefaultRyoContact,
  createContactFromDraft,
  findMatchingContact,
  mergeContacts,
  parseVCardText,
  seedDefaultContacts,
} from "../src/utils/contacts";

describe("contacts vCard parsing", () => {
  test("parses multiple vcards and captures telegram urls", () => {
    const vcard = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:Avery Chen",
      "N:Chen;Avery;;;",
      "EMAIL;TYPE=WORK:avery@example.com",
      "TEL;TYPE=CELL:+1 555 0100",
      "URL:https://t.me/averyc",
      "NOTE:Prefers Telegram",
      "END:VCARD",
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:Maya Rivers",
      "EMAIL;TYPE=HOME:maya@example.com",
      "ADR;TYPE=HOME:;;123 River St;Oakland;CA;94607;USA",
      "END:VCARD",
    ].join("\n");

    const result = parseVCardText(vcard);

    expect(result.warnings).toHaveLength(0);
    expect(result.contacts).toHaveLength(2);
    expect(result.contacts[0].displayName).toBe("Avery Chen");
    expect(result.contacts[0].telegramUsername).toBe("averyc");
    expect(result.contacts[1].addresses[0]?.formatted).toContain("Oakland");
  });

  test("merges duplicate contacts by email", () => {
    const existing = createContactFromDraft({
      displayName: "Avery Chen",
      emails: ["avery@example.com"],
      notes: "Original note",
      source: "manual",
    });

    const incoming = createContactFromDraft({
      displayName: "Avery Chen",
      emails: ["avery@example.com"],
      phones: ["+1 555 0100"],
      telegramUsername: "averyc",
      source: "vcard",
    });

    const match = findMatchingContact([existing], incoming);
    expect(match?.id).toBe(existing.id);

    const merged = mergeContacts(existing, incoming);
    expect(merged.emails).toHaveLength(1);
    expect(merged.phones[0]?.value).toBe("+1 555 0100");
    expect(merged.telegramUsername).toBe("averyc");
    expect(merged.notes).toContain("Original note");
  });

  test("seeds default ryo contact exactly once", () => {
    const seeded = seedDefaultContacts([]);
    expect(seeded).toHaveLength(1);
    expect(seeded[0].displayName).toBe("Ryo Lu");
    expect(seeded[0].emails[0]?.value).toBe("me@ryo.lu");
    expect(seeded[0].organization).toBe("Cursor");
    expect(seeded[0].title).toBe("");
    expect(seeded[0].notes).toBe("");

    const existingRyo = createDefaultRyoContact();
    const seededAgain = seedDefaultContacts([existingRyo]);
    expect(seededAgain).toHaveLength(1);
    expect(seededAgain[0].displayName).toBe("Ryo Lu");
  });
});
