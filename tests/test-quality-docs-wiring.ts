#!/usr/bin/env bun
/**
 * Wiring tests for quality guardrail documentation.
 *
 * Why:
 * Keeps contributor-facing guardrail policy docs aligned with enforced checks.
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

const readGuardrailDoc = (): string =>
  readFileSync(resolve(process.cwd(), "docs/code-quality-guardrails.md"), "utf-8");

export async function runQualityDocsWiringTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Quality Docs Wiring Tests"));

  console.log(section("Command documentation"));
  await runTest("guardrail docs list key quality commands", async () => {
    const source = readGuardrailDoc();
    const requiredCommands = [
      "bun run quality:check",
      "bun run quality:check:json",
      "bun run quality:summary quality-report.json",
      "bun run quality:verify",
      "bun run quality:all",
      "bun run quality:all:ci",
    ];

    for (const command of requiredCommands) {
      assert(
        source.includes(command),
        `Missing quality command in docs/code-quality-guardrails.md: ${command}`
      );
    }
  });

  console.log(section("Guardrail policy documentation"));
  await runTest("guardrail docs mention critical security policies", async () => {
    const source = readGuardrailDoc();
    const requiredPolicySnippets = [
      "No `@ts-nocheck` comments in source or scripts",
      "No dynamic code execution (`eval(` / `new Function(` / `Function(\"...\")`)",
      "No `debugger` statements in `scripts` / `src` / `_api`",
      "No unresolved merge conflict markers (`<<<<<<<`, `|||||||`, `=======`,",
      "with and without trailing branch labels",
      "documentation (markdown + MDX)",
      "JSON/TOML config files",
      "No `innerHTML` assignments/mutations (`=`, `+=`) in `src`",
      "No `innerHTML` assignments/mutations (`=`, `+=`) in `src`\n  (including bracket-access forms)",
      "No `outerHTML` assignments/mutations (`=`, `+=`) in `src`",
      "No `outerHTML` assignments/mutations (`=`, `+=`) in `src`\n  (including bracket-access forms)",
      "No `insertAdjacentHTML(...)` usage in `src` (including bracket-access forms)",
      "No `document.write(...)` / `document.writeln(...)` usage in `src`",
      "including bracket/optional-bracket access forms, with spacing-tolerant matching",
      "No string-based timer execution (`setTimeout(\"...\")`, `setInterval(\"...\")`,",
      "`setImmediate(\"...\")`, including template literals and optional-chaining calls",
      "Script task markers (`TODO`, `FIXME`, `HACK`, `XXX`) must stay at or below",
      "applies to `.{ts,tsx,mts,cts}` files under `src` / `_api`",
      "no `scripts/*.{ts,js,mts,cts,mjs,cjs}` files over 700 LOC",
      "No `execSync(` usage in `scripts` / `src` / `_api`",
      "No `shell: true` usage in `scripts` / `src` / `_api` (including quoted,",
      "computed, and simple variable-computed key syntax",
      "No `child_process` `exec` imports in `scripts` / `src` / `_api`",
      "No `child_process.exec(...)` direct usage",
      "alias detection is variable-aware",
      "optional-chaining forms are also blocked",
      "bracket-notation variants are also blocked",
      "cp?.[\"exec\"](...)",
      "invocation matching is spacing-tolerant",
      "No Prisma unsafe raw SQL methods",
      "No `Prisma.raw(...)` usage",
      "Allowlisted `dangerouslySetInnerHTML` usage only",
      "`schemaVersion` plus `totalChecks` and",
      "`failedChecks` metadata.",
      "validated as exact integer `1`",
      "Validation includes `passed` vs failed-status consistency",
      "non-negative integer check values",
      "requires FAIL checks to include at least one offender entry",
      "unique check names",
      "unique offender paths within each failed check entry",
      "offender paths sorted ascending within each failed check",
      "rejects whitespace-only offender paths",
      "non-empty checks array",
      "non-empty (non-whitespace) `root`, check names, and",
      "cap-overflow failures print offending allowlisted file paths for triage",
      "failed-check offender previews (top 5 per check)",
      "When count metadata is omitted, summary rendering derives counts from `checks`",
      "Most content checks scan TypeScript and JavaScript sources",
      "(`.ts/.tsx/.js/.jsx/.mts/.cts/.mjs/.cjs`)",
      "quality audit report wiring tests",
      "baseline cap (19)",
    ];

    for (const policySnippet of requiredPolicySnippets) {
      assert(
        source.includes(policySnippet),
        `Missing guardrail policy docs snippet: ${policySnippet}`
      );
    }
  });

  return printSummary();
}

if (import.meta.main) {
  runQualityDocsWiringTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
