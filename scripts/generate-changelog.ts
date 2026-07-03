#!/usr/bin/env bun
/**
 * Generate changelog documentation from git commit history.
 * Uses AI to summarize commits into meaningful changelog entries.
 * Groups commits by month with major changes highlighted and minor changes collapsible.
 *
 * Usage:
 *   bun run scripts/generate-changelog.ts                    # Generate changelog
 *   bun run scripts/generate-changelog.ts --months=6         # Last 6 months only
 *   bun run scripts/generate-changelog.ts --dry-run          # Preview without writing
 */

import { execFileSync } from "child_process";
import { writeFile, stat } from "fs/promises";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";

const OUTPUT_FILE = "docs/9-changelog.md";
const DEFAULT_MONTHS = 12;

interface Commit {
  hash: string;
  date: Date;
  message: string;
  author: string;
}

interface MonthGroup {
  year: number;
  month: number;
  label: string;
  commits: Commit[];
}

interface SummarizedMonth {
  label: string;
  majorChanges: string[];
  minorChanges: string[];
}

/**
 * Check if API key is available
 */
function checkApiKey(): boolean {
  return !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
}

/**
 * Parse git log output into commit objects
 */
function parseGitLog(logOutput: string): Commit[] {
  const commits: Commit[] = [];
  const entries = logOutput.split("\n---COMMIT_SEPARATOR---\n").filter(Boolean);

  for (const entry of entries) {
    const lines = entry.trim().split("\n");
    if (lines.length < 3) continue;

    const hash = lines[0]?.trim() || "";
    const dateStr = lines[1]?.trim() || "";
    const author = lines[2]?.trim() || "";
    const message = lines[3]?.trim() || "";

    if (!hash || !dateStr) continue;

    commits.push({
      hash,
      date: new Date(dateStr),
      author,
      message,
    });
  }

  return commits;
}

/**
 * Filter out merge commits and trivial changes
 */
function filterCommits(commits: Commit[]): Commit[] {
  return commits.filter((commit) => {
    const message = commit.message.toLowerCase();

    // Skip merge commits
    if (message.startsWith("merge ")) return false;
    if (message.startsWith("merge pull request")) return false;

    // Skip version bumps
    if (/^v?\d+\.\d+\.\d+$/.test(commit.message.trim())) return false;

    // Skip trivial commits
    if (message === "wip" || message === "work in progress") return false;

    return true;
  });
}

/**
 * Group commits by month
 */
function groupByMonth(commits: Commit[]): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  for (const commit of commits) {
    const year = commit.date.getFullYear();
    const month = commit.date.getMonth();
    const key = `${year}-${String(month).padStart(2, "0")}`;

    if (!groups.has(key)) {
      groups.set(key, {
        year,
        month,
        label: `${monthNames[month]} ${year}`,
        commits: [],
      });
    }

    groups.get(key)!.commits.push(commit);
  }

  // Sort by date descending (most recent first)
  return Array.from(groups.values()).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });
}

/**
 * Use AI to summarize commits for a month
 */
async function summarizeMonth(group: MonthGroup): Promise<SummarizedMonth> {
  const commitMessages = group.commits
    .map((c) => `- ${c.message}`)
    .join("\n");

  const prompt = `You are summarizing git commits for a ryOS changelog. Given these ${group.commits.length} commits from ${group.label}, create a concise changelog summary.

COMMITS:
${commitMessages}

RULES:
1. Group related commits into single meaningful entries; deduplicate overlaps
2. Major changes (up to 5 items): new apps/features, platform/infrastructure rewrites, large refactors, breaking changes. Combine related work and sort by impact (platform first, then new apps, then significant feature work). Move everything else to minor changes
3. Minor changes (5-15 items): bug fixes, polish, refactors, chores, docs, CI. Never duplicate a major entry
4. Major format: start with **Bold feature/app name**: then a concise description (one sentence when possible). Example: "**Cloud Sync v2**: journal-based delta sync with per-key conflict resolution."
5. Minor format: start with a capitalized action verb (Fix, Improve, Refactor, Remove, Add, Update). No conventional-commit prefixes (feat:, fix:, refactor:). No bold unless naming a small UI surface
6. Use clear, user-facing language; keep technical paths/PR numbers only when they add context
7. Skip trivial changes (typos, formatting-only commits)
8. Do not repeat the same change in both major and minor lists

OUTPUT FORMAT (JSON):
{
  "majorChanges": ["**Feature**: description", "**Another feature**: description"],
  "minorChanges": ["Fix something specific.", "Refactor a module for clarity."]
}

Return ONLY valid JSON, no other text.`;

  try {
    const { text } = await generateText({
      model: google("gemini-2.0-flash"),
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(`⚠️  Could not parse AI response for ${group.label}`);
      return fallbackSummarize(group);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      label: group.label,
      majorChanges: (parsed.majorChanges || []).slice(0, 5),
      minorChanges: parsed.minorChanges || [],
    };
  } catch (error) {
    console.warn(`⚠️  AI summarization failed for ${group.label}:`, error);
    return fallbackSummarize(group);
  }
}

/**
 * Fallback summarization without AI
 */
function fallbackSummarize(group: MonthGroup): SummarizedMonth {
  const major: string[] = [];
  const minor: string[] = [];

  for (const commit of group.commits.slice(0, 20)) {
    const msg = commit.message;
    const isFeature = /^(feat|add|implement|new)/i.test(msg);
    
    if (isFeature && major.length < 5) {
      major.push(msg.replace(/^(feat|feature)(\(.*?\))?:\s*/i, ""));
    } else if (minor.length < 10) {
      minor.push(msg.replace(/^(fix|chore|docs|style)(\(.*?\))?:\s*/i, ""));
    }
  }

  return { label: group.label, majorChanges: major, minorChanges: minor };
}

/**
 * Generate markdown content with collapsible sections
 */
function generateMarkdown(summarizedMonths: SummarizedMonth[]): string {
  const lines: string[] = [
    "# Changelog",
    "",
    "A summary of changes and updates to ryOS, organized by month.",
    "",
    "Each month highlights up to five major features. Open **More from this month** for fixes, polish, infrastructure, and smaller updates.",
    "",
    "---",
    "",
  ];

  for (const month of summarizedMonths) {
    // Skip months with no changes
    if (month.majorChanges.length === 0 && month.minorChanges.length === 0) continue;

    lines.push(`## ${month.label}`);
    lines.push("");

    // Major changes as bullet points
    if (month.majorChanges.length > 0) {
      for (const change of month.majorChanges) {
        lines.push(`- ${change}`);
      }
      lines.push("");
    }

    // Minor changes in collapsible details
    if (month.minorChanges.length > 0) {
      lines.push("<details>");
      lines.push(`<summary>More from this month (${month.minorChanges.length})</summary>`);
      lines.push("");
      for (const change of month.minorChanges) {
        lines.push(`- ${change}`);
      }
      lines.push("");
      lines.push("</details>");
      lines.push("");
    }
  }

  // Add footer
  lines.push("---");
  lines.push("");
  lines.push(
    `*This changelog is maintained from git history and manual curation. Last updated: ${new Date().toISOString().split("T")[0]}*`
  );
  lines.push("");

  return lines.join("\n");
}

/**
 * Get git log since a certain date
 */
function getGitLog(monthsBack: number): string {
  const since = new Date();
  since.setMonth(since.getMonth() - monthsBack);
  const sinceStr = since.toISOString().split("T")[0];

  try {
    const output = execFileSync(
      "git",
      [
        "log",
        `--since=${sinceStr}`,
        "--pretty=format:%H%n%aI%n%an%n%s%n---COMMIT_SEPARATOR---",
        "--no-merges",
      ],
      {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      }
    );
    return output;
  } catch (error) {
    console.error("Failed to get git log:", error);
    return "";
  }
}

/**
 * Check if changelog file exists
 */
async function changelogExists(): Promise<boolean> {
  try {
    await stat(OUTPUT_FILE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const monthsArg = args.find((arg) => arg.startsWith("--months="));
  const months = monthsArg
    ? parseInt(monthsArg.split("=")[1], 10)
    : DEFAULT_MONTHS;

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: bun run scripts/generate-changelog.ts [options]

Options:
  --months=<n>    Number of months to include (default: ${DEFAULT_MONTHS})
  --dry-run       Preview changelog without writing to file
  --force         Regenerate even if changelog exists
  --help, -h      Show this help message

Examples:
  bun run scripts/generate-changelog.ts
  bun run scripts/generate-changelog.ts --months=6
  bun run scripts/generate-changelog.ts --dry-run
`);
    process.exit(0);
  }

  const hasApiKey = checkApiKey();
  const exists = await changelogExists();

  // Never overwrite a curated changelog unless --force (generate:docs only renders HTML).
  if (!dryRun && !force && exists) {
    console.log("ℹ️  Changelog already exists, skipping (pass --force to regenerate from git history)");
    return;
  }

  if (!dryRun && !hasApiKey) {
    console.error("❌ GOOGLE_GENERATIVE_AI_API_KEY required for initial changelog generation");
    process.exit(1);
  }

  console.log("📝 Generating Changelog from Git History");
  console.log("═".repeat(50));
  console.log(`  Months to include: ${months}`);
  console.log(`  Output file: ${OUTPUT_FILE}`);
  console.log(`  AI summarization: ${hasApiKey ? "enabled" : "disabled"}`);
  console.log("");

  // Get git log
  console.log("📖 Reading git history...");
  const gitLog = getGitLog(months);

  if (!gitLog) {
    console.error("❌ No commits found or git command failed");
    process.exit(1);
  }

  // Parse and process commits
  const rawCommits = parseGitLog(gitLog);
  console.log(`   Found ${rawCommits.length} total commits`);

  const filteredCommits = filterCommits(rawCommits);
  console.log(`   After filtering: ${filteredCommits.length} commits`);

  // Group by month
  const monthGroups = groupByMonth(filteredCommits);
  console.log(`   Months with activity: ${monthGroups.length}`);

  // Summarize each month with AI
  console.log("\n🤖 Summarizing with AI...");
  const summarizedMonths: SummarizedMonth[] = [];

  for (const group of monthGroups) {
    process.stdout.write(`   Processing ${group.label}...`);
    const summary = await summarizeMonth(group);
    summarizedMonths.push(summary);
    console.log(` ✓ (${summary.majorChanges.length} major, ${summary.minorChanges.length} minor)`);
    
    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Generate markdown
  const markdown = generateMarkdown(summarizedMonths);

  if (dryRun) {
    console.log("\n🔍 Dry-run mode - Preview:\n");
    console.log("─".repeat(50));
    console.log(markdown);
    console.log("─".repeat(50));
    console.log("\n💡 Run without --dry-run to write to file");
  } else {
    // Write to file
    await writeFile(OUTPUT_FILE, markdown, "utf-8");
    console.log(`\n✅ Changelog written to ${OUTPUT_FILE}`);

    const lineCount = markdown.split("\n").length;
    console.log(`   Total lines: ${lineCount}`);
  }
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
