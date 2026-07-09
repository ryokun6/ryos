import { describe, expect, test } from "bun:test";
import { optimizePhosphorImports } from "../../../vite/optimizePhosphorImports";

describe("optimizePhosphorImports", () => {
  const plugin = optimizePhosphorImports();
  const transform = plugin.transform as (
    code: string,
    id: string
  ) => { code: string; map: null } | null;

  test("rewrites named barrel imports to CSR subpaths", () => {
    const result = transform(
      `import { X, Check as CheckIcon } from "@phosphor-icons/react";\nexport const icons = [X, CheckIcon];\n`,
      "/workspace/src/components/Example.tsx"
    );
    expect(result?.code).toContain(
      `import X from "@phosphor-icons/react/dist/csr/X";`
    );
    expect(result?.code).toContain(
      `import CheckIcon from "@phosphor-icons/react/dist/csr/Check";`
    );
    expect(result?.code).not.toContain(`from "@phosphor-icons/react"`);
  });

  test("leaves type-only imports on the barrel", () => {
    const source = `import type { Icon } from "@phosphor-icons/react";\n`;
    const result = transform(source, "/workspace/src/components/Example.tsx");
    expect(result).toBeNull();
  });

  test("skips node_modules and non-JS files", () => {
    const code = `import { X } from "@phosphor-icons/react";\n`;
    expect(transform(code, "/workspace/node_modules/foo/index.js")).toBeNull();
    expect(transform(code, "/workspace/src/styles.css")).toBeNull();
  });
});
