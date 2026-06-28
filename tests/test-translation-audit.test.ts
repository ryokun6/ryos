import { describe, expect, test } from "bun:test";
import { auditTranslations } from "../scripts/audit-translations";

describe("translation audit", () => {
  test("all locales match the source and Apple UI terminology", async () => {
    expect(await auditTranslations()).toEqual([]);
  });
});
