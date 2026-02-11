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
      "DOM assignment hardening",
      "SQL safety guardrails",
      "string-based timer execution prevention",
      "command execution hardening (`child_process` `exec` import + direct usage blocked",
      "max script files over 700 LOC",
      "(`.js`, `.jsx`, `.mts`, `.cts`, `.mjs`, `.cjs`)",
      "including TS module variants `.mts/.cts`",
      "including explicit `.mjs`/`.cjs`/`.mts`/`.cts` regression paths",
    ];

    for (const snippet of requiredSnippets) {
      assert(source.includes(snippet), `Missing audit wiring snippet: ${snippet}`);
    }
  });

  await runTest("audit report references key security guardrails", async () => {
    const source = readAuditDoc();
    const requiredSecuritySnippets = [
      "`Prisma.raw(...)`",
      "`execSync(` prevention scope expanded",
      "string-based timer execution prevention",
      "optional/bracket invocation forms",
      "template-bracket access",
      "exact-API matching",
      "spacing-tolerant invocation matching",
      "DOM assignment hardening",
      "`srcdoc =`",
      "innerHTML +=`, `outerHTML +=`, `srcdoc +=` including bracket access",
      "srcdoc` is allowlisted only in",
      "HtmlPreview.tsx` with cap 2",
      "insertAdjacentHTML(...)` including bracket access",
      "bracket/optional-bracket access",
      "spaced-dot member access",
      "exact-member matching",
      "spacing-tolerant matching",
      "script task-marker baseline cap",
      "quoted/computed keys",
      "spaced unquoted key syntax",
      "variable-computed key aliases",
      "MDX merge-marker failure coverage",
      "YAML merge-marker failure coverage",
      "JSON merge-marker failure coverage",
      "TOML merge-marker failure coverage",
      "INI merge-marker failure coverage",
      "`.github` workflow merge-marker failure coverage",
      "diff3 merge-base marker",
      "bare marker (`<<<<<<<` / `>>>>>>>`) failure coverage",
      "trailing-whitespace merge-marker failure coverage",
      "documentation markdown merge-marker failure coverage",
      "root dotfile merge-marker failure coverage",
      "`.editorconfig`, `.gitignore`, `.gitattributes`",
      "hidden config-directory merge-marker failure coverage (`.vscode/settings.json`)",
      "separator-only (`=======`) non-anchor pass coverage",
      "`schemaVersion` type/positivity validation coverage",
      "only version 1 accepted",
      "`passed`/failed-status consistency",
      "PASS/offender",
      "duplicate check-name validation coverage",
      "duplicate offender-path validation coverage",
      "offender-path ascending-order validation coverage",
      "offender-count-total vs check-value consistency validation coverage",
      "for count-based checks",
      "whitespace-only offender-path rejection coverage",
      "surrounding-whitespace offender-path rejection coverage",
      "backslash offender-path rejection coverage",
      "line-break rejection for root/check-name/allowed/offender-path fields",
      "FAIL-check offender-presence validation coverage",
      "non-empty checks-array validation coverage",
      "non-whitespace root/check-name/allowed-text validation coverage",
      "surrounding-whitespace rejection for root/check-name/allowed-text fields",
      "inline `require(\"child_process\").exec(...)` usage",
      "alias-destructuring import/require forms",
      "alias-object destructuring (`const { exec } = cp`)",
      "false-positive prevention coverage",
      "optional-chaining `?.exec(...)` variant coverage",
      "inline `require(\"child_process\")?.exec(...)` variant coverage",
      "require-alias optional-chaining variant coverage",
      "bracket-notation variant coverage",
      "optional bracket variant coverage",
      "spaced-invocation variant coverage",
      "allowlisted-check offender output",
      "cap-overflow diagnostics assertions",
      "`srcdoc`, `biome-ignore lint/correctness/useExhaustiveDependencies`",
    ];

    for (const snippet of requiredSecuritySnippets) {
      assert(
        source.includes(snippet),
        `Missing audit security guardrail snippet: ${snippet}`
      );
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
