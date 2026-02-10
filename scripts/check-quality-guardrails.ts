#!/usr/bin/env bun

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

interface GuardrailCheck {
  name: string;
  roots: string[];
  extensions: string[];
  pattern: RegExp;
  maxAllowed: number;
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".vercel",
  "coverage",
  "src-tauri",
]);

const GUARDRAILS: GuardrailCheck[] = [
  {
    name: "eslint-disable comments",
    roots: ["src", "_api"],
    extensions: [".ts", ".tsx"],
    pattern: /eslint-disable/g,
    maxAllowed: 0,
  },
  {
    name: "@ts-ignore/@ts-expect-error",
    roots: ["src", "_api"],
    extensions: [".ts", ".tsx"],
    pattern: /@ts-ignore|@ts-expect-error/g,
    maxAllowed: 0,
  },
  {
    name: "innerHTML assignments",
    roots: ["src"],
    extensions: [".ts", ".tsx"],
    pattern: /innerHTML\s*=/g,
    maxAllowed: 0,
  },
  {
    name: "execSync usage in scripts",
    roots: ["scripts"],
    extensions: [".ts"],
    pattern: /execSync\(/g,
    maxAllowed: 0,
  },
];

const gatherFiles = async (
  root: string,
  extensions: ReadonlyArray<string>
): Promise<string[]> => {
  const files: string[] = [];

  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (SKIP_DIRS.has(entry.name)) continue;

      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      if (extensions.some((ext) => entry.name.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  };

  const rootStats = await stat(root).catch(() => null);
  if (!rootStats || !rootStats.isDirectory()) {
    return files;
  }

  await walk(root);
  return files;
};

const countPatternInFile = async (
  filePath: string,
  pattern: RegExp
): Promise<number> => {
  const source = await readFile(filePath, "utf-8");
  const matches = source.match(pattern);
  return matches ? matches.length : 0;
};

const run = async (): Promise<void> => {
  const cwd = process.cwd();
  let hasViolation = false;

  console.log("Quality guardrails check\n");

  for (const check of GUARDRAILS) {
    const candidateFiles = (
      await Promise.all(
        check.roots.map((root) => gatherFiles(join(cwd, root), check.extensions))
      )
    ).flat();

    let total = 0;
    const offenders: Array<{ path: string; count: number }> = [];
    for (const file of candidateFiles) {
      const count = await countPatternInFile(file, check.pattern);
      if (count > 0) {
        total += count;
        offenders.push({ path: relative(cwd, file), count });
      }
    }

    const status = total <= check.maxAllowed ? "PASS" : "FAIL";
    console.log(
      `${status.padEnd(4)} ${check.name}: ${total} (allowed <= ${check.maxAllowed})`
    );

    if (total > check.maxAllowed) {
      hasViolation = true;
      for (const offender of offenders.slice(0, 20)) {
        console.log(`      - ${offender.path} (${offender.count})`);
      }
      if (offenders.length > 20) {
        console.log(`      ... and ${offenders.length - 20} more files`);
      }
    }
  }

  console.log("");
  if (hasViolation) {
    process.exit(1);
  }
};

run().catch((error) => {
  console.error("Quality guardrails check failed:", error);
  process.exit(1);
});
