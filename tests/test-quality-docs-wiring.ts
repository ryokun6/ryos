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
      "No dynamic code execution (`eval(` / `new Function(`)",
      "No `debugger` statements in `scripts` / `src` / `_api`",
      "No unresolved merge conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)",
      "No `outerHTML = ...` assignments in `src`",
      "No `insertAdjacentHTML(...)` usage in `src`",
      "No `document.write(...)` usage in `src`",
      "No string-based timer execution (`setTimeout(\"...\")`, `setInterval(\"...\")`,",
      "`setImmediate(\"...\")`, including template literals)",
      "No `execSync(` usage in `scripts` / `src` / `_api`",
      "No `child_process` `exec` imports in `scripts` / `src` / `_api`",
      "No Prisma unsafe raw SQL methods",
      "Allowlisted `dangerouslySetInnerHTML` usage only",
      "`schemaVersion` plus `totalChecks` and",
      "`failedChecks` metadata.",
      "failed-check offender previews (top 5 per check)",
      "When count metadata is omitted, summary rendering derives counts from `checks`",
      "Most content checks scan TypeScript and JavaScript sources (`.ts/.tsx/.js/.jsx`)",
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
