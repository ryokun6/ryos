import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, test } from "bun:test";
import { getThemeBootstrapConfig } from "../../../src/themes/bootstrapConfig";
import { themes } from "../../../src/themes";

describe("theme bootstrap config", () => {
  test("public first-paint config matches the TypeScript registry", () => {
    const source = readFileSync("public/theme-bootstrap-config.js", "utf8");
    const context = { window: {} as { __RYOS_THEME_BOOTSTRAP__?: unknown } };

    vm.runInNewContext(source, context);

    expect(context.window.__RYOS_THEME_BOOTSTRAP__).toEqual(
      getThemeBootstrapConfig()
    );
    expect(getThemeBootstrapConfig().defaultAquaMaterial).toBe("glass");
  });

  test("inline first-paint fallback covers every shipped theme", () => {
    const source = readFileSync("index.html", "utf8");

    for (const id of Object.keys(getThemeBootstrapConfig().themes)) {
      expect(source).toContain(`${id}: {`);
    }
  });

  test("theme registry keeps runtime visuals in CSS tokens only", () => {
    for (const theme of Object.values(themes)) {
      expect("colors" in theme).toBe(false);
      expect("metrics" in theme).toBe(false);
      expect("fonts" in theme).toBe(false);
    }
  });
});
