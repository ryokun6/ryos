import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { collectStaticImportGraph } from "../../../scripts/trace-import-chain";
import {
  LAZY_VENDOR_CHUNK_NAMES,
  VENDOR_CHUNK_GROUPS,
  packageNameOf,
  vendorCodeSplittingGroups,
} from "../../../vite/vendorChunks";

const BARE_IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\s+(?!type\b)[^"'()]*?from\s*["']([^"'./][^"']*)["']|(?:^|\n)\s*import\s*["']([^"'./][^"']*)["']/g;

function bootPackageImports(): Map<string, string[]> {
  const importers = new Map<string, string[]>();
  for (const file of collectStaticImportGraph()) {
    if (!file.match(/\.(ts|tsx|js|jsx)$/)) continue;
    for (const match of readFileSync(file, "utf-8").matchAll(BARE_IMPORT_RE)) {
      const specifier = match[1] ?? match[2];
      if (!specifier || specifier.startsWith("@/")) continue;
      const packageName = specifier.startsWith("@")
        ? specifier.split("/").slice(0, 2).join("/")
        : specifier.split("/")[0];
      importers.set(packageName, [...(importers.get(packageName) ?? []), file]);
    }
  }
  return importers;
}

describe("vendor code-splitting groups", () => {
  test("resolves package names from module ids", () => {
    expect(packageNameOf("/w/node_modules/react-dom/cjs/client.js")).toBe(
      "react-dom"
    );
    expect(
      packageNameOf("/w/node_modules/@radix-ui/react-select/dist/index.mjs")
    ).toBe("@radix-ui/react-select");
    expect(
      packageNameOf(
        "/w/node_modules/.bun/@tiptap+core@3.0.0/node_modules/@tiptap/core/dist/index.js"
      )
    ).toBe("@tiptap/core");
    expect(
      packageNameOf(
        "C:\\w\\node_modules\\.pnpm\\three@0.180.0\\node_modules\\three\\build\\three.module.js"
      )
    ).toBe("three");
    expect(
      packageNameOf("C:\\w\\node_modules\\@radix-ui\\react-tabs\\dist\\index.mjs")
    ).toBe("@radix-ui/react-tabs");
    expect(packageNameOf("/w/src/components/ui/select.tsx")).toBeUndefined();
  });

  test("boot groups capture before lazy groups", () => {
    const firstLazy = VENDOR_CHUNK_GROUPS.findIndex((group) => !group.boot);
    expect(firstLazy).toBeGreaterThan(0);
    expect(VENDOR_CHUNK_GROUPS.slice(firstLazy).every((g) => !g.boot)).toBe(
      true
    );

    const groups = vendorCodeSplittingGroups();
    expect(groups[0].name).toBe("preload-helper");
    for (let index = 1; index < groups.length; index += 1) {
      expect(groups[index].priority).toBeLessThan(groups[index - 1].priority);
    }
    expect(LAZY_VENDOR_CHUNK_NAMES).toEqual(
      VENDOR_CHUNK_GROUPS.filter((g) => !g.boot).map((g) => g.name)
    );
    expect(LAZY_VENDOR_CHUNK_NAMES).toContain("tiptap");
    expect(LAZY_VENDOR_CHUNK_NAMES).not.toContain("react");
  });

  test("each package belongs to exactly one group", () => {
    const packages = VENDOR_CHUNK_GROUPS.flatMap((group) => group.packages);
    expect(new Set(packages).size).toBe(packages.length);
  });

  test("group tests only match their own packages", () => {
    const byName = new Map(
      vendorCodeSplittingGroups().map((group) => [group.name, group])
    );
    const tiptap = byName.get("tiptap")!;
    expect(tiptap.test("/w/node_modules/@tiptap/react/dist/index.js")).toBe(true);
    expect(tiptap.test("/w/node_modules/@tiptap/pm/state/dist/index.js")).toBe(
      false
    );
    expect(tiptap.test("/w/src/apps/textedit/Editor.tsx")).toBe(false);
    expect(
      byName.get("preload-helper")!.test("\0vite/preload-helper.js")
    ).toBe(true);
  });

  test("packages the shell imports directly are assigned to boot groups", () => {
    // A package imported by a boot module but listed in a lazy group (or
    // reached only as a dependency of one) makes the entry modulepreload that
    // lazy chunk. Shared deps the shell imports directly must be listed in a
    // boot group explicitly.
    const groupOfPackage = new Map(
      VENDOR_CHUNK_GROUPS.flatMap((group) =>
        group.packages.map((name) => [name, group] as const)
      )
    );
    const importers = bootPackageImports();
    expect(importers.has("react")).toBe(true);

    const offenders = [...importers]
      .filter(([name]) => groupOfPackage.get(name)?.boot === false)
      .map(([name, files]) => `${name} (${files.join(", ")})`);
    expect(offenders).toEqual([]);

    const unlistedRadix = [...importers.keys()].filter(
      (name) => name.startsWith("@radix-ui/") && !groupOfPackage.has(name)
    );
    expect(unlistedRadix).toEqual([]);
  });
});
