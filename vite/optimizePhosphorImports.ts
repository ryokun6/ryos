import type { Plugin } from "vite";

/**
 * Rewrites barrel imports from `@phosphor-icons/react` into per-icon CSR
 * subpath imports so Rollup/Vite can tree-shake unused icons.
 *
 *   import { X, Check } from "@phosphor-icons/react";
 *   →
 *   import X from "@phosphor-icons/react/dist/csr/X";
 *   import Check from "@phosphor-icons/react/dist/csr/Check";
 *
 * Type-only imports (`import type { Icon }`) are left on the barrel.
 */
const BARREL = "@phosphor-icons/react";
const CSR_PREFIX = "@phosphor-icons/react/dist/csr";

const IMPORT_RE =
  /import\s+(type\s+)?\{([^}]+)\}\s+from\s+["']@phosphor-icons\/react["']\s*;?/g;

function rewritePhosphorImports(code: string): string | null {
  if (!code.includes(BARREL)) return null;

  let changed = false;
  const next = code.replace(
    IMPORT_RE,
    (full, typeKeyword: string | undefined, specifiers: string) => {
      if (typeKeyword) return full;

      const names = specifiers
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const [imported, local] = part.split(/\s+as\s+/).map((s) => s.trim());
          return { imported, local: local || imported };
        })
        .filter((entry) => entry.imported && /^[A-Z][A-Za-z0-9]*$/.test(entry.imported));

      if (names.length === 0) return full;

      changed = true;
      return names
        .map(
          ({ imported, local }) =>
            `import ${local} from "${CSR_PREFIX}/${imported}";`
        )
        .join("\n");
    }
  );

  return changed ? next : null;
}

export function optimizePhosphorImports(): Plugin {
  return {
    name: "ryos-optimize-phosphor-imports",
    enforce: "pre",
    transform(code, id) {
      if (!/\.[cm]?[jt]sx?$/.test(id)) return null;
      if (id.includes("node_modules")) return null;
      const rewritten = rewritePhosphorImports(code);
      if (!rewritten) return null;
      return { code: rewritten, map: null };
    },
  };
}
