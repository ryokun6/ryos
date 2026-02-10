#!/usr/bin/env bun

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

interface GuardrailCheck {
  name: string;
  roots: string[];
  extensions: string[];
  pattern: RegExp;
  maxAllowed: number;
  excludeFiles?: ReadonlySet<string>;
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

interface GuardrailResult {
  name: string;
  status: "PASS" | "FAIL";
  value: number;
  allowed: string;
  offenders?: Array<{ path: string; count: number }>;
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".vercel",
  "coverage",
  "src-tauri",
]);

const SOURCE_CACHE = new Map<string, Promise<string>>();
const CANDIDATE_FILE_CACHE = new Map<string, Promise<string[]>>();

const GUARDRAILS: GuardrailCheck[] = [
  {
    name: "eslint-disable comments",
    roots: ["src", "_api", "scripts"],
    extensions: [".ts", ".tsx", ".js"],
    pattern: /eslint-disable/g,
    maxAllowed: 0,
    excludeFiles: new Set(["scripts/check-quality-guardrails.ts"]),
  },
  {
    name: "@ts-ignore/@ts-expect-error",
    roots: ["src", "_api", "scripts"],
    extensions: [".ts", ".tsx", ".js"],
    pattern: /@ts-ignore|@ts-expect-error/g,
    maxAllowed: 0,
    excludeFiles: new Set(["scripts/check-quality-guardrails.ts"]),
  },
  {
    name: "@ts-nocheck comments",
    roots: ["src", "_api", "scripts"],
    extensions: [".ts", ".tsx", ".js"],
    pattern: /@ts-nocheck/g,
    maxAllowed: 0,
    excludeFiles: new Set(["scripts/check-quality-guardrails.ts"]),
  },
  {
    name: "innerHTML assignments",
    roots: ["src"],
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    pattern: /innerHTML\s*=/g,
    maxAllowed: 0,
  },
  {
    name: "execSync usage in scripts",
    roots: ["scripts"],
    extensions: [".ts", ".js"],
    pattern: /execSync\(/g,
    maxAllowed: 0,
  },
  {
    name: "child_process exec import usage in scripts",
    roots: ["scripts"],
    extensions: [".ts", ".js"],
    pattern:
      /\bimport\s*\{[^}]*\bexec\b[^}]*\}\s*from\s*["'](?:node:)?child_process["']|\b(?:const|let|var)\s*\{[^}]*\bexec\b[^}]*\}\s*=\s*require\(["'](?:node:)?child_process["']\)/g,
    maxAllowed: 0,
  },
  {
    name: "shell:true command execution",
    roots: ["scripts", "src", "_api"],
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    pattern: /shell:\s*true/g,
    maxAllowed: 0,
    excludeFiles: new Set(["scripts/check-quality-guardrails.ts"]),
  },
  {
    name: "TODO/FIXME/HACK markers",
    roots: ["src", "_api"],
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    pattern: /\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b/g,
    maxAllowed: 0,
  },
  {
    name: "dynamic code execution (eval/new Function)",
    roots: ["scripts", "src", "_api"],
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    pattern: /\beval\(|new Function\(/g,
    maxAllowed: 0,
  },
  {
    name: "debugger statements",
    roots: ["scripts", "src", "_api"],
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    pattern: /\bdebugger\b/g,
    maxAllowed: 0,
    excludeFiles: new Set(["scripts/check-quality-guardrails.ts"]),
  },
  {
    name: "merge conflict markers",
    roots: ["scripts", "src", "_api", "tests"],
    extensions: [".ts", ".tsx", ".js", ".md", ".yml", ".yaml"],
    pattern: /^<<<<<<< .+|^=======\s*$|^>>>>>>> .+/gm,
    maxAllowed: 0,
  },
];

const FILE_SIZE_GUARDRAILS: FileSizeGuardrail[] = [
  {
    name: "very large TypeScript files",
    roots: ["src", "_api"],
    extensions: [".ts", ".tsx"],
    lineThreshold: 1000,
    maxFilesOverThreshold: 29,
    maxSingleFileLines: 2600,
  },
  {
    name: "large TypeScript files",
    roots: ["src", "_api"],
    extensions: [".ts", ".tsx"],
    lineThreshold: 1500,
    maxFilesOverThreshold: 14,
    maxSingleFileLines: 2600,
  },
];

const DANGEROUSLY_SET_INNER_HTML_GUARDRAIL: AllowlistedPatternGuardrail = {
  name: "dangerouslySetInnerHTML usage",
  roots: ["src"],
  extensions: [".ts", ".tsx"],
  pattern: /dangerouslySetInnerHTML/g,
  allowedFiles: new Set(["src/components/shared/HtmlPreview.tsx"]),
  maxAllowedTotal: 2,
};

const BIOME_EXHAUSTIVE_DEPS_BYPASS_GUARDRAIL: AllowlistedPatternGuardrail = {
  name: "biome exhaustive-deps bypass comments",
  roots: ["src", "_api"],
  extensions: [".ts", ".tsx"],
  pattern: /biome-ignore\s+lint\/correctness\/useExhaustiveDependencies/g,
  allowedFiles: new Set(["src/hooks/useStreamingFetch.ts"]),
  maxAllowedTotal: 1,
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
  const source = await readSource(filePath);
  const matches = source.match(pattern);
  return matches ? matches.length : 0;
};

const countLinesInFile = async (filePath: string): Promise<number> => {
  const source = await readSource(filePath);
  return source.split("\n").length;
};

const readSource = async (filePath: string): Promise<string> => {
  const cached = SOURCE_CACHE.get(filePath);
  if (cached) {
    return cached;
  }

  const readPromise = readFile(filePath, "utf-8");
  SOURCE_CACHE.set(filePath, readPromise);
  return readPromise;
};

const getCandidateFiles = async (
  cwd: string,
  roots: ReadonlyArray<string>,
  extensions: ReadonlyArray<string>
): Promise<string[]> => {
  const rootsKey = [...roots].sort().join(",");
  const extensionsKey = [...extensions].sort().join(",");
  const cacheKey = `${cwd}|${rootsKey}|${extensionsKey}`;

  const cached = CANDIDATE_FILE_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const gatherPromise = Promise.all(
    roots.map((root) => gatherFiles(join(cwd, root), extensions))
  ).then((grouped) => grouped.flat());

  CANDIDATE_FILE_CACHE.set(cacheKey, gatherPromise);
  return gatherPromise;
};

const checkAllowlistedPattern = async (
  cwd: string,
  guardrail: AllowlistedPatternGuardrail
): Promise<{
  passed: boolean;
  total: number;
  disallowedMatches: Array<{ path: string; count: number }>;
}> => {
  const candidateFiles = await getCandidateFiles(
    cwd,
    guardrail.roots,
    guardrail.extensions
  );

  const matches = (
    await Promise.all(
      candidateFiles.map(async (file) => {
        const relativePath = relative(cwd, file).replaceAll("\\", "/");
        const count = await countPatternInFile(file, guardrail.pattern);
        if (count <= 0) return null;
        return { path: relativePath, count };
      })
    )
  ).filter((match): match is { path: string; count: number } => match !== null);

  const total = matches.reduce((sum, match) => sum + match.count, 0);
  const disallowedMatches = matches.filter(
    (match) => !guardrail.allowedFiles.has(match.path)
  );

  const passed =
    disallowedMatches.length === 0 && total <= guardrail.maxAllowedTotal;
  return { passed, total, disallowedMatches };
};

const run = async (): Promise<void> => {
  const cwd = process.env.QUALITY_GUARDRAILS_ROOT || process.cwd();
  let hasViolation = false;
  const jsonOutput = process.argv.includes("--json");
  const results: GuardrailResult[] = [];

  if (!jsonOutput) {
    console.log("Quality guardrails check\n");
  }

  for (const check of GUARDRAILS) {
    const candidateFiles = await getCandidateFiles(cwd, check.roots, check.extensions);

    const offenders = (
      await Promise.all(
        candidateFiles.map(async (file) => {
          const relativePath = relative(cwd, file).replaceAll("\\", "/");
          if (check.excludeFiles?.has(relativePath)) {
            return null;
          }
          const count = await countPatternInFile(file, check.pattern);
          if (count <= 0) return null;
          return { path: relativePath, count };
        })
      )
    ).filter(
      (offender): offender is { path: string; count: number } =>
        offender !== null
    );
    offenders.sort((a, b) => a.path.localeCompare(b.path));

    const total = offenders.reduce((sum, offender) => sum + offender.count, 0);

    const status = total <= check.maxAllowed ? "PASS" : "FAIL";
    results.push({
      name: check.name,
      status,
      value: total,
      allowed: `<= ${check.maxAllowed}`,
      offenders: status === "FAIL" ? offenders : undefined,
    });

    if (!jsonOutput) {
      console.log(
        `${status.padEnd(4)} ${check.name}: ${total} (allowed <= ${check.maxAllowed})`
      );
    }

    if (total > check.maxAllowed) {
      hasViolation = true;
      if (!jsonOutput) {
        for (const offender of offenders.slice(0, 20)) {
          console.log(`      - ${offender.path} (${offender.count})`);
        }
        if (offenders.length > 20) {
          console.log(`      ... and ${offenders.length - 20} more files`);
        }
      }
    }
  }

  for (const fileSizeGuardrail of FILE_SIZE_GUARDRAILS) {
    const sizeCandidateFiles = await getCandidateFiles(
      cwd,
      fileSizeGuardrail.roots,
      fileSizeGuardrail.extensions
    );

    const largeFiles = (
      await Promise.all(
        sizeCandidateFiles.map(async (file) => {
          const lines = await countLinesInFile(file);
          if (lines <= fileSizeGuardrail.lineThreshold) {
            return null;
          }
          return {
            path: relative(cwd, file).replaceAll("\\", "/"),
            count: lines,
          };
        })
      )
    ).filter((file): file is { path: string; count: number } => file !== null);

    largeFiles.sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));
    const largestFileLines = largeFiles[0]?.count ?? 0;
    const largeFileCount = largeFiles.length;
    const fileSizeOk =
      largeFileCount <= fileSizeGuardrail.maxFilesOverThreshold &&
      largestFileLines <= fileSizeGuardrail.maxSingleFileLines;

    const fileSizeStatus = fileSizeOk ? "PASS" : "FAIL";
    results.push({
      name: fileSizeGuardrail.name,
      status: fileSizeStatus,
      value: largeFileCount,
      allowed: `files <= ${fileSizeGuardrail.maxFilesOverThreshold}; largest <= ${fileSizeGuardrail.maxSingleFileLines}`,
      offenders: fileSizeStatus === "FAIL" ? largeFiles : undefined,
    });

    if (!jsonOutput) {
      console.log(
        `${fileSizeStatus.padEnd(4)} ${fileSizeGuardrail.name}: ${largeFileCount} files over ${fileSizeGuardrail.lineThreshold} LOC (allowed <= ${fileSizeGuardrail.maxFilesOverThreshold}); largest file ${largestFileLines} LOC (allowed <= ${fileSizeGuardrail.maxSingleFileLines})`
      );
    }

    if (!fileSizeOk) {
      hasViolation = true;
      if (!jsonOutput) {
        for (const file of largeFiles.slice(0, 20)) {
          console.log(`      - ${file.path} (${file.count} LOC)`);
        }
        if (largeFiles.length > 20) {
          console.log(`      ... and ${largeFiles.length - 20} more files`);
        }
      }
    }
  }

  const allowlistedPatternGuardrails = [
    DANGEROUSLY_SET_INNER_HTML_GUARDRAIL,
    BIOME_EXHAUSTIVE_DEPS_BYPASS_GUARDRAIL,
  ];

  for (const guardrail of allowlistedPatternGuardrails) {
    const result = await checkAllowlistedPattern(cwd, guardrail);
    const status = result.passed ? "PASS" : "FAIL";
    results.push({
      name: guardrail.name,
      status,
      value: result.total,
      allowed: `<= ${guardrail.maxAllowedTotal} (allowlisted files: ${guardrail.allowedFiles.size})`,
      offenders: status === "FAIL" ? result.disallowedMatches : undefined,
    });

    if (!jsonOutput) {
      console.log(
        `${status.padEnd(4)} ${guardrail.name}: ${result.total} (allowed <= ${guardrail.maxAllowedTotal}, files allowlisted: ${guardrail.allowedFiles.size})`
      );
    }

    if (!result.passed) {
      hasViolation = true;
      if (!jsonOutput) {
        const disallowedMatches = [...result.disallowedMatches].sort((a, b) =>
          a.path.localeCompare(b.path)
        );
        for (const offender of disallowedMatches) {
          console.log(`      - ${offender.path} (${offender.count})`);
        }
      }
    }
  }

  if (jsonOutput) {
    const failedChecks = results.filter((result) => result.status === "FAIL");
    console.log(
      JSON.stringify(
        {
          schemaVersion: 1,
          root: cwd,
          passed: !hasViolation,
          totalChecks: results.length,
          failedChecks: failedChecks.length,
          checks: results,
        },
        null,
        2
      )
    );
  } else {
    console.log("");
  }

  if (hasViolation) {
    process.exit(1);
  }
};

run().catch((error) => {
  console.error("Quality guardrails check failed:", error);
  process.exit(1);
});
