#!/usr/bin/env bun

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

interface QualityCheckEntry {
  name: string;
  status: "PASS" | "FAIL";
  value: number;
  allowed: string;
  offenders?: Array<{ path: string; count: number }>;
}

interface QualityReport {
  root: string;
  passed: boolean;
  checks: QualityCheckEntry[];
}

const iconForStatus = (status: "PASS" | "FAIL"): string =>
  status === "PASS" ? "✅" : "❌";

const run = async (): Promise<void> => {
  const reportArg = process.argv[2] || "quality-report.json";
  const reportPath = resolve(process.cwd(), reportArg);
  const raw = await readFile(reportPath, "utf-8");
  const report = JSON.parse(raw) as QualityReport;
  const failedChecks = report.checks.filter((check) => check.status === "FAIL");

  const lines: string[] = [];
  lines.push("## Quality Guardrails Report");
  lines.push("");
  lines.push(`- Root: \`${report.root}\``);
  lines.push(`- Overall: ${report.passed ? "✅ PASS" : "❌ FAIL"}`);
  lines.push(`- Total checks: ${report.checks.length}`);
  lines.push(`- Failed checks: ${failedChecks.length}`);
  if (failedChecks.length > 0) {
    lines.push(
      `- Failed check names: ${failedChecks.map((check) => check.name).join(", ")}`
    );
  }
  const failedChecksWithOffenders = failedChecks.filter(
    (check) => Array.isArray(check.offenders) && check.offenders.length > 0
  );
  if (failedChecksWithOffenders.length > 0) {
    lines.push("");
    lines.push("### Failed check offenders (top 5 each)");
    for (const check of failedChecksWithOffenders) {
      lines.push(`- **${check.name}**`);
      for (const offender of (check.offenders || []).slice(0, 5)) {
        lines.push(`  - \`${offender.path}\` (${offender.count})`);
      }
    }
  }
  lines.push("");
  lines.push("| Check | Status | Value | Allowed |");
  lines.push("|---|---:|---:|---|");
  for (const check of report.checks) {
    lines.push(
      `| ${check.name} | ${iconForStatus(check.status)} ${check.status} | ${check.value} | ${check.allowed} |`
    );
  }
  lines.push("");

  process.stdout.write(`${lines.join("\n")}\n`);
};

run().catch((error) => {
  console.error("Failed to render quality report summary:", error);
  process.exit(1);
});
