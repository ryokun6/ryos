import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("AirDrop API client wiring", () => {
  test("AirDrop store uses src/api/airdrop wrappers", () => {
    const source = readFileSync("src/stores/useAirDropStore.ts", "utf8");

    expect(source).toContain("@/api/airdrop");
    expect(source).toContain("sendAirDropHeartbeat");
    expect(source).toContain("discoverAirDropUsers");
    expect(source).toContain("sendAirDropFile");
    expect(source).toContain("respondToAirDropTransfer");
    expect(source).not.toContain("/api/airdrop/");
    expect(source).not.toContain("makeApiRequest");
  });
});
