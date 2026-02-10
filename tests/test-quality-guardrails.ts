#!/usr/bin/env bun
/**
 * Wiring tests for quality guardrail script.
 *
 * Why:
 * Ensures guardrail command remains runnable and keeps checking the expected
 * policy categories as the script evolves.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  header,
  section,
  runTest,
  printSummary,
  clearResults,
  assert,
  assertEq,
} from "./test-utils";

const runQualityCheck = (qualityRoot?: string) =>
  spawnSync("bun", ["run", "scripts/check-quality-guardrails.ts"], {
    cwd: process.cwd(),
    encoding: "utf-8",
    stdio: "pipe",
    env: {
      ...process.env,
      ...(qualityRoot ? { QUALITY_GUARDRAILS_ROOT: qualityRoot } : {}),
    },
  });

const withTempQualityRoot = (setup: (root: string) => void): string => {
  const root = mkdtempSync(join(tmpdir(), "ryos-quality-guardrails-"));
  setup(root);
  return root;
};

export async function runQualityGuardrailTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Quality Guardrail Wiring Tests"));

  console.log(section("Command execution"));
  await runTest("quality:check command exits successfully", async () => {
    const result = runQualityCheck();

    assertEq(result.status, 0, `Expected exit code 0, got ${result.status}`);
    assert(
      (result.stdout || "").includes("Quality guardrails check"),
      "Expected quality guardrails header in stdout"
    );
  });

  console.log(section("Guardrail categories"));
  await runTest("reports suppression and command safety checks", async () => {
    const result = runQualityCheck();

    const out = result.stdout || "";
    assert(out.includes("eslint-disable comments"), "Missing eslint-disable guardrail");
    assert(
      out.includes("@ts-ignore/@ts-expect-error"),
      "Missing ts-ignore guardrail"
    );
    assert(out.includes("innerHTML assignments"), "Missing innerHTML guardrail");
    assert(out.includes("execSync usage in scripts"), "Missing execSync guardrail");
    assert(out.includes("shell:true command execution"), "Missing shell:true guardrail");
  });

  await runTest("reports maintainability and HTML allowlist checks", async () => {
    const result = runQualityCheck();

    const out = result.stdout || "";
    assert(out.includes("large TypeScript files"), "Missing file-size guardrail");
    assert(
      out.includes("dangerouslySetInnerHTML usage"),
      "Missing dangerouslySetInnerHTML allowlist guardrail"
    );
  });

  console.log(section("Failure behavior"));
  await runTest("fails when disallowed eslint-disable appears in source", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "Bad.ts"),
        `// eslint-disable-next-line no-console\nconsole.log("x");\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for bad source, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL eslint-disable comments"),
        "Expected eslint-disable guardrail failure"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest(
    "fails when dangerouslySetInnerHTML is used outside allowlist",
    async () => {
      const qualityRoot = withTempQualityRoot((root) => {
        mkdirSync(join(root, "src"), { recursive: true });
        writeFileSync(
          join(root, "src", "Bad.tsx"),
          `export function Bad(){return <div dangerouslySetInnerHTML={{__html:"<b>x</b>"}} />}\n`,
          "utf-8"
        );
      });

      try {
        const result = runQualityCheck(qualityRoot);
        assertEq(
          result.status,
          1,
          `Expected failure exit code 1 for disallowed HTML usage, got ${result.status}`
        );
        assert(
          (result.stdout || "").includes("FAIL dangerouslySetInnerHTML usage"),
          "Expected dangerouslySetInnerHTML allowlist guardrail failure"
        );
      } finally {
        rmSync(qualityRoot, { recursive: true, force: true });
      }
    }
  );

  return printSummary();
}

if (import.meta.main) {
  runQualityGuardrailTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
