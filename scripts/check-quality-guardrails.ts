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

interface FileSizeGuardrail {
  name: string;
  roots: string[];
  extensions: string[];
  lineThreshold: number;
  maxFilesOverThreshold: number;
  maxSingleFileLines: number;
}

interface AllowlistedPatternGuardrail {
  name: string;
  roots: string[];
  extensions: string[];
  pattern: RegExp;
  allowedFiles: ReadonlySet<string>;
  maxAllowedTotal: number;
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

const FILE_SIZE_GUARDRAIL: FileSizeGuardrail = {
  name: "large TypeScript files",
  roots: ["src", "_api"],
  extensions: [".ts", ".tsx"],
  lineThreshold: 1500,
  maxFilesOverThreshold: 14,
  maxSingleFileLines: 2600,
};

const DANGEROUSLY_SET_INNER_HTML_GUARDRAIL: AllowlistedPatternGuardrail = {
  name: "dangerouslySetInnerHTML usage",
  roots: ["src"],
  extensions: [".ts", ".tsx"],
  pattern: /dangerouslySetInnerHTML/g,
  allowedFiles: new Set(["src/components/shared/HtmlPreview.tsx"]),
  maxAllowedTotal: 2,
};

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

const countLinesInFile = async (filePath: string): Promise<number> => {
  const source = await readFile(filePath, "utf-8");
  return source.split("\n").length;
};

const checkAllowlistedPattern = async (
  cwd: string,
  guardrail: AllowlistedPatternGuardrail
): Promise<{
  passed: boolean;
  total: number;
  disallowedMatches: Array<{ path: string; count: number }>;
}> => {
  const candidateFiles = (
    await Promise.all(
      guardrail.roots.map((root) =>
        gatherFiles(join(cwd, root), guardrail.extensions)
      )
    )
  ).flat();

  let total = 0;
  const disallowedMatches: Array<{ path: string; count: number }> = [];

  for (const file of candidateFiles) {
    const relativePath = relative(cwd, file).replaceAll("\\", "/");
    const count = await countPatternInFile(file, guardrail.pattern);
    if (count <= 0) continue;
    total += count;
    if (!guardrail.allowedFiles.has(relativePath)) {
      disallowedMatches.push({ path: relativePath, count });
    }
  }

  const passed =
    disallowedMatches.length === 0 && total <= guardrail.maxAllowedTotal;
  return { passed, total, disallowedMatches };
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

  const sizeCandidateFiles = (
    await Promise.all(
      FILE_SIZE_GUARDRAIL.roots.map((root) =>
        gatherFiles(join(cwd, root), FILE_SIZE_GUARDRAIL.extensions)
      )
    )
  ).flat();

  const largeFiles: Array<{ path: string; lines: number }> = [];
  for (const file of sizeCandidateFiles) {
    const lines = await countLinesInFile(file);
    if (lines > FILE_SIZE_GUARDRAIL.lineThreshold) {
      largeFiles.push({
        path: relative(cwd, file),
        lines,
      });
    }
  }

  largeFiles.sort((a, b) => b.lines - a.lines);
  const largestFileLines = largeFiles[0]?.lines ?? 0;
  const largeFileCount = largeFiles.length;
  const fileSizeOk =
    largeFileCount <= FILE_SIZE_GUARDRAIL.maxFilesOverThreshold &&
    largestFileLines <= FILE_SIZE_GUARDRAIL.maxSingleFileLines;

  const fileSizeStatus = fileSizeOk ? "PASS" : "FAIL";
  console.log(
    `${fileSizeStatus.padEnd(4)} ${FILE_SIZE_GUARDRAIL.name}: ${largeFileCount} files over ${FILE_SIZE_GUARDRAIL.lineThreshold} LOC (allowed <= ${FILE_SIZE_GUARDRAIL.maxFilesOverThreshold}); largest file ${largestFileLines} LOC (allowed <= ${FILE_SIZE_GUARDRAIL.maxSingleFileLines})`
  );

  if (!fileSizeOk) {
    hasViolation = true;
    for (const file of largeFiles.slice(0, 20)) {
      console.log(`      - ${file.path} (${file.lines} LOC)`);
    }
    if (largeFiles.length > 20) {
      console.log(`      ... and ${largeFiles.length - 20} more files`);
    }
  }

  const dangerouslySetInnerHtmlResult = await checkAllowlistedPattern(
    cwd,
    DANGEROUSLY_SET_INNER_HTML_GUARDRAIL
  );
  const dangerousStatus = dangerouslySetInnerHtmlResult.passed ? "PASS" : "FAIL";
  console.log(
    `${dangerousStatus.padEnd(4)} ${DANGEROUSLY_SET_INNER_HTML_GUARDRAIL.name}: ${dangerouslySetInnerHtmlResult.total} (allowed <= ${DANGEROUSLY_SET_INNER_HTML_GUARDRAIL.maxAllowedTotal}, files allowlisted: ${DANGEROUSLY_SET_INNER_HTML_GUARDRAIL.allowedFiles.size})`
  );

  if (!dangerouslySetInnerHtmlResult.passed) {
    hasViolation = true;
    for (const offender of dangerouslySetInnerHtmlResult.disallowedMatches) {
      console.log(`      - ${offender.path} (${offender.count})`);
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
