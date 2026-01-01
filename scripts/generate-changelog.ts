#!/usr/bin/env bun
/**
 * Generate a monthly changelog from git history.
 *
 * - Reads commit history (excluding merges) via `git log`.
 * - Groups commits by month (newest first).
 * - Classifies commits as major or minor based on message keywords.
 * - Writes docs/9-changelog.md so it appears in the docs navigation.
 *
 * Usage:
 *   bun run scripts/generate-changelog.ts            # default window (last 12 months)
 *   bun run scripts/generate-changelog.ts --months 18
 *   bun run scripts/generate-changelog.ts --all      # full history
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");
const OUTPUT_PATH = join(ROOT_DIR, "docs", "9-changelog.md");

const DEFAULT_MONTHS = 12;
const DEFAULT_PER_MONTH_LIMIT = 20;

const MAJOR_KEYWORDS = [
  "feat",
  "feature",
  "add",
  "introduce",
  "implement",
  "create",
  "launch",
  "upgrade",
  "refactor",
  "redesign",
  "breaking",
  "perf",
  "optimize",
  "improve",
  "enhance",
];

const MINOR_KEYWORDS = [
  "fix",
  "chore",
  "docs",
  "doc",
  "test",
  "tests",
  "tweak",
  "refine",
  "cleanup",
  "style",
  "ci",
  "build",
  "revert",
];

type ChangeLevel = "major" | "minor";

interface CommitEntry {
  monthKey: string; // e.g., "2026-01"
  monthLabel: string; // e.g., "January 2026"
  message: string;
  level: ChangeLevel;
}

interface Options {
  months: number;
  all: boolean;
  perMonthLimit: number;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const all = args.includes("--all");

  const monthsFlagIndex = args.findIndex((arg) => arg === "--months");
  let months = DEFAULT_MONTHS;

  if (monthsFlagIndex !== -1) {
    const value = args[monthsFlagIndex + 1];
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      months = parsed;
    }
  } else {
    const inline = args.find((arg) => arg.startsWith("--months="));
    if (inline) {
      const value = inline.split("=")[1];
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        months = parsed;
      }
    }
  }

  const perMonthFlagIndex = args.findIndex((arg) => arg === "--per-month");
  let perMonthLimit = DEFAULT_PER_MONTH_LIMIT;

  if (perMonthFlagIndex !== -1) {
    const value = args[perMonthFlagIndex + 1];
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      perMonthLimit = parsed;
    }
  } else {
    const inlinePerMonth = args.find((arg) => arg.startsWith("--per-month="));
    if (inlinePerMonth) {
      const value = inlinePerMonth.split("=")[1];
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        perMonthLimit = parsed;
      }
    }
  }

  return { months, all, perMonthLimit };
}

function normalizeMessage(message: string): string {
  let cleaned = message.trim();
  // Strip common prefixes like "feat:", "fix(scope):", "docs!"
  cleaned = cleaned.replace(/^[a-z]+(\([^)]+\))?!?:\s*/i, "");
  // Remove leading bullet markers if present
  cleaned = cleaned.replace(/^[-*]\s+/, "");
  return cleaned.trim();
}

function classify(message: string): ChangeLevel {
  const lower = message.toLowerCase();

  const isKeyword = (keyword: string) =>
    lower.startsWith(`${keyword}:`) ||
    lower.startsWith(`${keyword}(`) ||
    lower.startsWith(`${keyword}!`) ||
    lower.startsWith(`${keyword} `) ||
    lower === keyword ||
    lower.startsWith(`${keyword}-`);

  if (MAJOR_KEYWORDS.some(isKeyword)) return "major";
  if (MINOR_KEYWORDS.some(isKeyword)) return "minor";
  return "minor"; // default to minor if unclassified
}

function formatMonth(date: Date): { key: string; label: string } {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const key = `${year}-${String(month).padStart(2, "0")}`;
  const label = date.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return { key, label };
}

function readGitHistory(): string {
  try {
    return execFileSync("git", ["log", "--no-merges", "--pretty=format:%H|%ct|%s"], {
      cwd: ROOT_DIR,
      encoding: "utf-8",
    });
  } catch (error) {
    console.error("❌ Failed to read git history. Ensure git is available and this is a git repo.");
    throw error;
  }
}

function buildChangelog(options: Options): CommitEntry[] {
  const raw = readGitHistory();
  if (!raw.trim()) return [];

  const lines = raw.split("\n").filter(Boolean);
  const entries: CommitEntry[] = [];
  const seenMonths: string[] = [];
  const perMonthDedupe = new Map<string, Set<string>>();

  for (const line of lines) {
    const [hash, ts, ...rest] = line.split("|");
    if (!hash || !ts || rest.length === 0) continue;

    const messageRaw = rest.join("|").trim();
    if (!messageRaw) continue;

    const date = new Date(Number.parseInt(ts, 10) * 1000);
    const { key, label } = formatMonth(date);

    if (!seenMonths.includes(key)) {
      seenMonths.push(key);
    }

    const message = normalizeMessage(messageRaw);
    if (!message) continue;

    const level = classify(message);

    const dedupeKey = `${level}:${message.toLowerCase()}`;
    const monthSet = perMonthDedupe.get(key) ?? new Set<string>();
    if (monthSet.has(dedupeKey)) continue;

    monthSet.add(dedupeKey);
    perMonthDedupe.set(key, monthSet);

    entries.push({ monthKey: key, monthLabel: label, message, level });
  }

  const limitedMonths = options.all ? seenMonths : seenMonths.slice(0, options.months);
  const allowedMonths = new Set(limitedMonths);

  return entries.filter((entry) => allowedMonths.has(entry.monthKey));
}

function renderMarkdown(entries: CommitEntry[], options: Options): string {
  if (entries.length === 0) {
    return [
      "# Changelog",
      "",
      "_No commits found to generate changelog._",
      "",
    ].join("\n");
  }

  const monthsInOrder: string[] = [];
  const monthMeta = new Map<string, { label: string; major: string[]; minor: string[] }>();

  for (const entry of entries) {
    if (!monthsInOrder.includes(entry.monthKey)) {
      monthsInOrder.push(entry.monthKey);
      monthMeta.set(entry.monthKey, { label: entry.monthLabel, major: [], minor: [] });
    }
    const bucket = monthMeta.get(entry.monthKey);
    if (!bucket) continue;
    bucket[entry.level].push(entry.message);
  }

  const lines: string[] = [];
  lines.push("# Changelog");
  lines.push("");
  lines.push(
    `_Auto-generated from git history on ${new Date().toISOString()}. ` +
    `Run \`bun run generate:changelog\` to refresh. ` +
    `${options.all ? "Using full history." : `Default window: last ${options.months} month(s), max ${options.perMonthLimit} per category.`} ` +
    `Merge commits are skipped. Major keywords: ${MAJOR_KEYWORDS.join(", ")}. Minor keywords: ${MINOR_KEYWORDS.join(", ")}._`
  );
  lines.push("");

  for (const monthKey of monthsInOrder) {
    const data = monthMeta.get(monthKey);
    if (!data) continue;

    lines.push(`## ${data.label}`);
    lines.push("");

    lines.push("- **Major**");
    if (data.major.length === 0) {
      lines.push("  - _No major changes noted._");
    } else {
      const majorToShow = options.all ? data.major : data.major.slice(0, options.perMonthLimit);
      for (const msg of majorToShow) {
        lines.push(`  - ${msg}`);
      }
      if (!options.all && data.major.length > options.perMonthLimit) {
        lines.push(`  - _… ${data.major.length - options.perMonthLimit} more major change(s) in git log_`);
      }
    }

    lines.push("- **Minor**");
    if (data.minor.length === 0) {
      lines.push("  - _No minor changes noted._");
    } else {
      const minorToShow = options.all ? data.minor : data.minor.slice(0, options.perMonthLimit);
      for (const msg of minorToShow) {
        lines.push(`  - ${msg}`);
      }
      if (!options.all && data.minor.length > options.perMonthLimit) {
        lines.push(`  - _… ${data.minor.length - options.perMonthLimit} more minor change(s) in git log_`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

function main() {
  const options = parseArgs();
  const entries = buildChangelog(options);
  const markdown = renderMarkdown(entries, options);
  writeFileSync(OUTPUT_PATH, markdown, "utf-8");
  console.log(`[changelog] Wrote ${OUTPUT_PATH} (${entries.length} entries${options.all ? ", full history" : ""}).`);
}

main();
