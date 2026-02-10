#!/usr/bin/env bun

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

interface QualityCheckEntry {
  name: string;
  status: "PASS" | "FAIL";
  value: number;
  allowed: string;
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

  const lines: string[] = [];
  lines.push("## Quality Guardrails Report");
  lines.push("");
  lines.push(`- Root: \`${report.root}\``);
  lines.push(`- Overall: ${report.passed ? "✅ PASS" : "❌ FAIL"}`);
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
