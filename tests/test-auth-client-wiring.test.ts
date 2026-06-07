import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("auth client wiring", () => {
  test("chat store auth flows use src/api/auth wrappers", () => {
    const source = readFileSync("src/stores/useChatsStore.ts", "utf8");

    expect(source).toContain("@/api/auth");
    expect(source).toContain("checkUserPassword()");
    expect(source).toContain("setUserPassword(");
    expect(source).toContain("logoutUser()");
    expect(source).toContain("registerUser(");
    expect(source).toContain("restoreAuthSession(");
    expect(source).not.toContain("/api/auth/password/check");
    expect(source).not.toContain("/api/auth/password/set");
    expect(source).not.toContain("/api/auth/register");
    expect(source).not.toContain("/api/auth/session");
  });

  test("terminal su password login uses the auth client wrapper", () => {
    const source = readFileSync(
      "src/apps/terminal/hooks/useTerminalLogic.ts",
      "utf8"
    );

    expect(source).toContain("loginWithPassword");
    expect(source).not.toContain("/api/auth/login");
  });

  test("control panels logout-all uses the auth client wrapper", () => {
    const source = readFileSync(
      "src/apps/control-panels/hooks/useControlPanelsLogic.ts",
      "utf8"
    );

    expect(source).toContain("logoutAllDevices");
    expect(source).not.toContain("/api/auth/logout-all");
  });
});
