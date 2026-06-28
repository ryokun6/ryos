import { describe, expect, test } from "bun:test";
import i18next from "i18next";
import {
  getAdminImportProgressPercent,
  getAdminImportStatusText,
  type AdminImportStatus,
} from "../src/apps/admin/components/admin-app/adminImportStatus";
import en from "../src/lib/locales/en/translation.json";

function makeImportStatus(
  overrides: Partial<AdminImportStatus> = {},
): AdminImportStatus {
  return {
    phase: "idle",
    fileName: null,
    totalSongs: 10,
    processedSongs: 4,
    imported: 3,
    updated: 1,
    message: null,
    error: null,
    ...overrides,
  };
}

async function createEnglishT() {
  const i18n = i18next.createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
  return i18n.getFixedT("en");
}

describe("admin import status i18n", () => {
  test("resolves every visible import phase from the English catalog", async () => {
    const t = await createEnglishT();

    expect(
      getAdminImportStatusText(
        makeImportStatus({ phase: "reading-file", fileName: "library.json" }),
        t,
      ),
    ).toBe("Reading library.json...");
    expect(
      getAdminImportStatusText(makeImportStatus({ phase: "parsing-file" }), t),
    ).toBe("Parsing import file...");
    expect(
      getAdminImportStatusText(makeImportStatus({ phase: "validating-data" }), t),
    ).toBe("Validating import data...");
    expect(
      getAdminImportStatusText(
        makeImportStatus({ phase: "preparing-songs" }),
        t,
      ),
    ).toBe("Preparing songs 4/10");
    expect(
      getAdminImportStatusText(
        makeImportStatus({ phase: "uploading-batches" }),
        t,
      ),
    ).toBe("Uploading songs 4/10");
    expect(
      getAdminImportStatusText(
        makeImportStatus({ phase: "waiting-rate-limit" }),
        t,
      ),
    ).toBe("Rate limited. Waiting briefly before retrying...");
    expect(
      getAdminImportStatusText(
        makeImportStatus({
          phase: "waiting-rate-limit",
          message: "Retrying in 3s",
        }),
        t,
      ),
    ).toBe("Rate limited. Retrying in 3s");
    expect(
      getAdminImportStatusText(
        makeImportStatus({ phase: "refreshing-library" }),
        t,
      ),
    ).toBe("Import uploaded. Refreshing library...");
    expect(
      getAdminImportStatusText(makeImportStatus({ phase: "completed" }), t),
    ).toBe("Import complete: 3 new, 1 updated");
    expect(
      getAdminImportStatusText(
        makeImportStatus({ phase: "failed", error: "Bad file" }),
        t,
      ),
    ).toBe("Import failed: Bad file");
    expect(getAdminImportStatusText(makeImportStatus(), t)).toBe("");
  });

  test("keeps bounded progress percentages for import phases", () => {
    expect(
      getAdminImportProgressPercent(
        makeImportStatus({
          phase: "uploading-batches",
          totalSongs: 100,
          processedSongs: 99,
        }),
      ),
    ).toBe(94);
    expect(
      getAdminImportProgressPercent(makeImportStatus({ phase: "completed" })),
    ).toBe(100);
    expect(
      getAdminImportProgressPercent(makeImportStatus({ phase: "failed" })),
    ).toBe(100);
  });
});
