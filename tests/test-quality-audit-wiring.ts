#!/usr/bin/env bun
/**
 * Wiring tests for the audit report documentation.
 *
 * Why:
 * Keeps the audit report aligned with implemented quality automation and checks.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  header,
  section,
  runTest,
  printSummary,
  clearResults,
  assert,
} from "./test-utils";

const readAuditDoc = (): string =>
  readFileSync(resolve(process.cwd(), "docs/code-quality-audit-2026-02-10.md"), "utf-8");

export async function runQualityAuditWiringTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Quality Audit Wiring Tests"));

  console.log(section("Audit report structure"));
  await runTest("audit report includes key sections", async () => {
    const source = readAuditDoc();
    const requiredSections = [
      "## Verification Gates",
      "## Baseline vs Current Metrics",
      "## Implemented Remediations",
      "## Residual Risk / Backlog (Prioritized)",
    ];

    for (const sectionTitle of requiredSections) {
      assert(source.includes(sectionTitle), `Missing audit section: ${sectionTitle}`);
    }
  });

  console.log(section("Audit report quality wiring"));
  await runTest("audit report references core quality commands and tests", async () => {
    const source = readAuditDoc();
    const requiredSnippets = [
      "`bun run quality:check:json`",
      "`bun run quality:all`",
      "`bun run quality:all:ci`",
      "`bun run quality:verify`",
      "`tests/test-quality-guardrails.ts`",
      "`tests/test-quality-workflow-wiring.ts`",
      "`tests/test-quality-scripts-wiring.ts`",
      "`tests/test-quality-summary-wiring.ts`",
      "`tests/test-quality-readme-wiring.ts`",
      "`tests/test-quality-docs-wiring.ts`",
      "`tests/test-quality-audit-wiring.ts`",
    ];

    for (const snippet of requiredSnippets) {
      assert(source.includes(snippet), `Missing audit wiring snippet: ${snippet}`);
    }
  });

  return printSummary();
}

if (import.meta.main) {
  runQualityAuditWiringTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
