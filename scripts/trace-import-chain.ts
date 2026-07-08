/**
 * Dev utility: trace static import chains from the client entry to a target
 * module. Helps find which import path drags a heavy module into the boot
 * bundle. Also imported by tests/unit/pwa/test-boot-import-graph.test.ts to guard the
 * boot graph against regressions.
 *
 * Usage: bun run scripts/trace-import-chain.ts <target-substring> [entry]
 * Example: bun run scripts/trace-import-chain.ts stores/useIpodStore
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const SRC = path.join(ROOT, "src");
const exts = [".ts", ".tsx", ".js", ".jsx"];

function resolveImport(fromFile: string, spec: string): string | null {
  if (spec.startsWith("@/")) spec = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) spec = path.join(path.dirname(fromFile), spec);
  else return null; // bare package import
  if (existsSync(spec) && !spec.match(/\.(ts|tsx|js|jsx|json|css)$/)) {
    for (const e of exts) {
      if (existsSync(spec + e)) return spec + e;
      if (existsSync(path.join(spec, "index" + e)))
        return path.join(spec, "index" + e);
    }
    return null;
  }
  if (existsSync(spec)) return spec;
  for (const e of exts) if (existsSync(spec + e)) return spec + e;
  return null;
}

// Static imports and re-exports only; dynamic import() intentionally excluded,
// and type-only imports are excluded since they vanish at compile time.
const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\s+(?!type\b)[^"'()]*?from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']/g;

function getImports(file: string): string[] {
  if (!file.match(/\.(ts|tsx|js|jsx)$/)) return [];
  let text: string;
  try {
    text = readFileSync(file, "utf-8");
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2];
    if (!spec) continue;
    const resolved = resolveImport(file, spec);
    if (resolved) out.push(resolved);
  }
  return out;
}

/**
 * BFS the static import graph from `entry`, returning the shortest chain of
 * repo-relative file paths ending at the first module whose path contains
 * `targetSubstring`, or null when the target is not statically reachable.
 */
export function findStaticImportChain(
  targetSubstring: string,
  entry: string = path.join(SRC, "main.tsx")
): string[] | null {
  const entryAbs = path.resolve(ROOT, entry);
  const parent = new Map<string, string>();
  const queue = [entryAbs];
  parent.set(entryAbs, "");
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.includes(targetSubstring)) {
      const chain: string[] = [];
      let node: string | undefined = cur;
      while (node) {
        chain.unshift(path.relative(ROOT, node));
        node = parent.get(node) || undefined;
      }
      return chain;
    }
    for (const dep of getImports(cur)) {
      if (!parent.has(dep)) {
        parent.set(dep, cur);
        queue.push(dep);
      }
    }
  }
  return null;
}

if (import.meta.main) {
  const target = process.argv[2];
  if (!target) {
    console.error(
      "usage: bun run scripts/trace-import-chain.ts <target-substring> [entry]"
    );
    process.exit(1);
  }
  const chain = findStaticImportChain(target, process.argv[3] ?? "src/main.tsx");
  if (!chain) {
    console.log(`No static chain from entry to "${target}"`);
  } else {
    console.log(chain.join("\n  -> "));
  }
}
