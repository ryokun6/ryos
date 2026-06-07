import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("stocks API client wiring", () => {
  test("dashboard stocks widget uses src/api/stocks", () => {
    const source = readFileSync(
      "src/components/layout/dashboard/stocks-widget/api.ts",
      "utf8"
    );

    expect(source).toContain("@/api/stocks");
    expect(source).toContain("getStocks");
    expect(source).not.toContain("fetch(");
  });
});
