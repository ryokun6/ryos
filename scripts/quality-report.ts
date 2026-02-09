import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";

type EslintMessage = {
  ruleId: string | null;
  severity: number;
};

type EslintResult = {
  filePath: string;
  errorCount: number;
  warningCount: number;
  messages: EslintMessage[];
};

const decoder = new TextDecoder();

const runEslint = Bun.spawnSync(["bunx", "eslint", ".", "-f", "json"], {
  stdout: "pipe",
  stderr: "pipe",
});

if (runEslint.exitCode === null || runEslint.exitCode > 1) {
  const stderr = decoder.decode(runEslint.stderr).trim();
  const stdout = decoder.decode(runEslint.stdout).trim();
  console.error("[quality-report] Failed to run eslint.");
  if (stdout) console.error(stdout);
  if (stderr) console.error(stderr);
  process.exit(1);
}

const rawJson = decoder.decode(runEslint.stdout).trim();
if (!rawJson) {
  console.error("[quality-report] eslint returned no JSON output.");
  process.exit(1);
}

const eslintResults = JSON.parse(rawJson) as EslintResult[];

const totals = eslintResults.reduce(
  (acc, result) => {
    acc.errors += result.errorCount;
    acc.warnings += result.warningCount;
    return acc;
  },
  { errors: 0, warnings: 0 }
);

const ruleCounts = new Map<string, number>();
for (const result of eslintResults) {
  for (const message of result.messages) {
    const ruleId = message.ruleId ?? "unknown";
    ruleCounts.set(ruleId, (ruleCounts.get(ruleId) ?? 0) + 1);
  }
}

const byRule = Array.from(ruleCounts.entries())
  .map(([ruleId, count]) => ({ ruleId, count }))
  .sort((a, b) => b.count - a.count);

const workspaceRoot = process.cwd();
const topFiles = eslintResults
  .map((result) => ({
    file: relative(workspaceRoot, result.filePath),
    errors: result.errorCount,
    warnings: result.warningCount,
    issues: result.errorCount + result.warningCount,
  }))
  .filter((item) => item.issues > 0)
  .sort((a, b) => b.issues - a.issues)
  .slice(0, 25);

const gitCommitProcess = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"], {
  stdout: "pipe",
  stderr: "pipe",
});
const gitCommit = decoder.decode(gitCommitProcess.stdout).trim() || "unknown";

const report = {
  generatedAt: new Date().toISOString(),
  gitCommit,
  totals: {
    ...totals,
    issues: totals.errors + totals.warnings,
  },
  byRule,
  topFiles,
};

const reportDir = resolve(workspaceRoot, "docs", "reports");
const reportPath = resolve(reportDir, "quality-baseline.json");
mkdirSync(reportDir, { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");

console.log(
  `[quality-report] Wrote report to docs/reports/quality-baseline.json (${report.totals.issues} issues).`
);
