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
  schemaVersion?: number;
  root: string;
  passed: boolean;
  totalChecks?: number;
  failedChecks?: number;
  checks: QualityCheckEntry[];
}

const iconForStatus = (status: "PASS" | "FAIL"): string =>
  status === "PASS" ? "✅" : "❌";

const assertQualityReport = (value: unknown): QualityReport => {
  if (!value || typeof value !== "object") {
    throw new Error("Quality report must be a JSON object");
  }

  const report = value as Partial<QualityReport>;
  if (typeof report.root !== "string" || report.root.length === 0) {
    throw new Error("Quality report must include a non-empty root");
  }
  if (typeof report.passed !== "boolean") {
    throw new Error("Quality report must include a boolean passed field");
  }
  if (
    report.schemaVersion !== undefined &&
    (!Number.isInteger(report.schemaVersion) || report.schemaVersion < 1)
  ) {
    throw new Error("Quality report schemaVersion must be a positive integer");
  }
  if (!Array.isArray(report.checks)) {
    throw new Error("Quality report must include a checks array");
  }

  for (const [index, check] of report.checks.entries()) {
    if (!check || typeof check !== "object") {
      throw new Error(`Invalid check entry at index ${index}`);
    }
    const candidate = check as Partial<QualityCheckEntry>;
    if (typeof candidate.name !== "string" || candidate.name.length === 0) {
      throw new Error(`Check at index ${index} must include a name`);
    }
    if (candidate.status !== "PASS" && candidate.status !== "FAIL") {
      throw new Error(`Check "${candidate.name}" has invalid status`);
    }
    if (typeof candidate.value !== "number") {
      throw new Error(`Check "${candidate.name}" must include numeric value`);
    }
    if (typeof candidate.allowed !== "string" || candidate.allowed.length === 0) {
      throw new Error(`Check "${candidate.name}" must include allowed text`);
    }
  }

  if (
    report.totalChecks !== undefined &&
    report.totalChecks !== report.checks.length
  ) {
    throw new Error("Quality report totalChecks metadata does not match checks length");
  }

  const computedFailedChecks = report.checks.filter(
    (check) => (check as QualityCheckEntry).status === "FAIL"
  ).length;
  if (
    report.failedChecks !== undefined &&
    report.failedChecks !== computedFailedChecks
  ) {
    throw new Error(
      "Quality report failedChecks metadata does not match failed check count"
    );
  }

  return report as QualityReport;
};

const run = async (): Promise<void> => {
  const reportArg = process.argv[2] || "quality-report.json";
  const reportPath = resolve(process.cwd(), reportArg);
  const raw = await readFile(reportPath, "utf-8");
  const report = assertQualityReport(JSON.parse(raw));
  const failedChecks = report.checks.filter((check) => check.status === "FAIL");
  const totalChecks = report.totalChecks ?? report.checks.length;
  const failedCheckCount = report.failedChecks ?? failedChecks.length;

  const lines: string[] = [];
  lines.push("## Quality Guardrails Report");
  lines.push("");
  if (report.schemaVersion !== undefined) {
    lines.push(`- Schema version: ${report.schemaVersion}`);
  }
  lines.push(`- Root: \`${report.root}\``);
  lines.push(`- Overall: ${report.passed ? "✅ PASS" : "❌ FAIL"}`);
  lines.push(`- Total checks: ${totalChecks}`);
  lines.push(`- Failed checks: ${failedCheckCount}`);
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
