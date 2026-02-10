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

const runQualityCheckJson = (qualityRoot?: string) =>
  spawnSync("bun", ["run", "scripts/check-quality-guardrails.ts", "--json"], {
    cwd: process.cwd(),
    encoding: "utf-8",
    stdio: "pipe",
    env: {
      ...process.env,
      ...(qualityRoot ? { QUALITY_GUARDRAILS_ROOT: qualityRoot } : {}),
    },
  });

const runQualitySummary = (reportPath: string) =>
  spawnSync("bun", ["run", "scripts/quality-report-summary.ts", reportPath], {
    cwd: process.cwd(),
    encoding: "utf-8",
    stdio: "pipe",
    env: {
      ...process.env,
    },
  });

const withTempQualityRoot = (setup: (root: string) => void): string => {
  const root = mkdtempSync(join(tmpdir(), "ryos-quality-guardrails-"));
  setup(root);
  return root;
};

const writeFileWithLineCount = (
  filePath: string,
  lineCount: number,
  linePrefix: string
) => {
  const contents = Array.from(
    { length: lineCount },
    (_, index) => `${linePrefix} ${index}\n`
  ).join("");
  writeFileSync(filePath, contents, "utf-8");
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

  await runTest("quality:check supports JSON output mode", async () => {
    const result = runQualityCheckJson();
    assertEq(result.status, 0, `Expected exit code 0, got ${result.status}`);
    const parsed = JSON.parse(result.stdout || "{}") as {
      schemaVersion?: number;
      passed?: boolean;
      totalChecks?: number;
      failedChecks?: number;
      checks?: Array<{ name: string }>;
    };
    assert(parsed.schemaVersion === 1, "Expected schemaVersion=1 in JSON output");
    assert(parsed.passed === true, "Expected JSON output to mark passed=true");
    assert(Array.isArray(parsed.checks), "Expected checks array in JSON output");
    assert(
      typeof parsed.totalChecks === "number" &&
        parsed.totalChecks === (parsed.checks || []).length,
      "Expected totalChecks metadata to match checks length"
    );
    assert(
      parsed.failedChecks === 0,
      "Expected failedChecks metadata to be zero for passing run"
    );
    const checkNames = new Set((parsed.checks || []).map((check) => check.name));
    const requiredCheckNames = [
      "eslint-disable comments",
      "@ts-ignore/@ts-expect-error",
      "@ts-nocheck comments",
      "innerHTML assignments",
      "outerHTML assignments",
      "insertAdjacentHTML usage",
      "document.write usage",
      "string-based timer execution usage",
      "execSync usage",
      "child_process exec import usage",
      "unsafe Prisma raw SQL methods",
      "Prisma.raw usage",
      "shell:true command execution",
      "TODO/FIXME/HACK markers",
      "dynamic code execution (eval/new Function)",
      "debugger statements",
      "merge conflict markers",
      "very large TypeScript files",
      "large TypeScript files",
      "dangerouslySetInnerHTML usage",
      "biome exhaustive-deps bypass comments",
    ];
    assertEq(
      parsed.totalChecks,
      requiredCheckNames.length,
      "Expected totalChecks to match required guardrail name list"
    );
    for (const checkName of requiredCheckNames) {
      assert(
        checkNames.has(checkName),
        `Expected ${checkName} guardrail in JSON checks`
      );
    }
  });

  await runTest("quality:check JSON check ordering is deterministic", async () => {
    const first = runQualityCheckJson();
    const second = runQualityCheckJson();
    assertEq(first.status, 0, "Expected first JSON run to pass");
    assertEq(second.status, 0, "Expected second JSON run to pass");

    const firstParsed = JSON.parse(first.stdout || "{}") as {
      checks?: Array<{ name: string; status: string; value: number }>;
      totalChecks?: number;
      failedChecks?: number;
    };
    const secondParsed = JSON.parse(second.stdout || "{}") as {
      checks?: Array<{ name: string; status: string; value: number }>;
      totalChecks?: number;
      failedChecks?: number;
    };

    const firstChecks = firstParsed.checks || [];
    const secondChecks = secondParsed.checks || [];
    assertEq(
      firstChecks.length,
      secondChecks.length,
      "Expected equal check counts between repeated JSON runs"
    );
    for (let index = 0; index < firstChecks.length; index++) {
      const a = firstChecks[index];
      const b = secondChecks[index];
      assert(
        a.name === b.name && a.status === b.status && a.value === b.value,
        `Expected deterministic check ordering/value at index ${index}`
      );
    }
    assertEq(
      firstParsed.totalChecks,
      secondParsed.totalChecks,
      "Expected deterministic totalChecks metadata"
    );
    assertEq(
      firstParsed.failedChecks,
      secondParsed.failedChecks,
      "Expected deterministic failedChecks metadata"
    );
  });

  await runTest("quality:summary renders markdown from JSON report", async () => {
    const jsonResult = runQualityCheckJson();
    assertEq(jsonResult.status, 0, "Expected JSON report command to pass");

    const tmpDir = mkdtempSync(join(tmpdir(), "ryos-quality-summary-"));
    const reportPath = join(tmpDir, "quality-report.json");
    writeFileSync(reportPath, jsonResult.stdout || "{}", "utf-8");

    try {
      const summaryResult = runQualitySummary(reportPath);
      assertEq(summaryResult.status, 0, "Expected summary command to pass");
      const out = summaryResult.stdout || "";
      assert(
        out.includes("## Quality Guardrails Report"),
        "Expected markdown heading in summary output"
      );
      assert(out.includes("- Schema version: 1"), "Expected schema version summary line");
      assert(
        out.includes("| Check | Status | Value | Allowed |"),
        "Expected markdown table header in summary output"
      );
      assert(out.includes("- Total checks:"), "Expected total checks summary line");
      assert(out.includes("- Failed checks:"), "Expected failed checks summary line");
      assert(
        out.includes("eslint-disable comments"),
        "Expected known guardrail row in summary output"
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
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
    assert(out.includes("@ts-nocheck comments"), "Missing ts-nocheck guardrail");
    assert(out.includes("innerHTML assignments"), "Missing innerHTML guardrail");
    assert(out.includes("outerHTML assignments"), "Missing outerHTML guardrail");
    assert(
      out.includes("insertAdjacentHTML usage"),
      "Missing insertAdjacentHTML guardrail"
    );
    assert(out.includes("document.write usage"), "Missing document.write guardrail");
    assert(
      out.includes("string-based timer execution usage"),
      "Missing string timer guardrail"
    );
    assert(out.includes("execSync usage"), "Missing execSync guardrail");
    assert(
      out.includes("child_process exec import usage"),
      "Missing child_process exec import guardrail"
    );
    assert(
      out.includes("unsafe Prisma raw SQL methods"),
      "Missing unsafe Prisma raw SQL guardrail"
    );
    assert(out.includes("Prisma.raw usage"), "Missing Prisma.raw guardrail");
    assert(out.includes("shell:true command execution"), "Missing shell:true guardrail");
    assert(out.includes("TODO/FIXME/HACK markers"), "Missing task marker guardrail");
    assert(
      out.includes("dynamic code execution (eval/new Function)"),
      "Missing dynamic code execution guardrail"
    );
    assert(out.includes("debugger statements"), "Missing debugger guardrail");
    assert(out.includes("merge conflict markers"), "Missing merge marker guardrail");
  });

  await runTest("reports maintainability and HTML allowlist checks", async () => {
    const result = runQualityCheck();

    const out = result.stdout || "";
    assert(
      out.includes("very large TypeScript files"),
      "Missing 1000+ LOC file-size guardrail"
    );
    assert(out.includes("large TypeScript files"), "Missing file-size guardrail");
    assert(
      out.includes("dangerouslySetInnerHTML usage"),
      "Missing dangerouslySetInnerHTML allowlist guardrail"
    );
    assert(
      out.includes("biome exhaustive-deps bypass comments"),
      "Missing biome exhaustive-deps bypass allowlist guardrail"
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

  await runTest("fails when disallowed eslint-disable appears in scripts", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "scripts"), { recursive: true });
      writeFileSync(
        join(root, "scripts", "BadScript.ts"),
        `// eslint-disable-next-line no-console\nconsole.log("x");\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for bad script, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL eslint-disable comments"),
        "Expected eslint-disable guardrail failure for scripts"
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

  await runTest(
    "fails when dangerouslySetInnerHTML is used in JavaScript outside allowlist",
    async () => {
      const qualityRoot = withTempQualityRoot((root) => {
        mkdirSync(join(root, "src"), { recursive: true });
        writeFileSync(
          join(root, "src", "Bad.jsx"),
          `export function Bad(){return <div dangerouslySetInnerHTML={{__html:"<b>x</b>"}} />}\n`,
          "utf-8"
        );
      });

      try {
        const result = runQualityCheck(qualityRoot);
        assertEq(
          result.status,
          1,
          `Expected failure exit code 1 for disallowed HTML usage in js, got ${result.status}`
        );
        assert(
          (result.stdout || "").includes("FAIL dangerouslySetInnerHTML usage"),
          "Expected dangerouslySetInnerHTML allowlist guardrail failure for js"
        );
      } finally {
        rmSync(qualityRoot, { recursive: true, force: true });
      }
    }
  );

  await runTest(
    "fails when dangerouslySetInnerHTML allowlisted total cap is exceeded",
    async () => {
      const qualityRoot = withTempQualityRoot((root) => {
        mkdirSync(join(root, "src/components/shared"), { recursive: true });
        writeFileSync(
          join(root, "src/components/shared/HtmlPreview.tsx"),
          [
            "export function HtmlPreview(){",
            "  return <div>",
            "    <span dangerouslySetInnerHTML={{ __html: '<b>a</b>' }} />",
            "    <span dangerouslySetInnerHTML={{ __html: '<b>b</b>' }} />",
            "    <span dangerouslySetInnerHTML={{ __html: '<b>c</b>' }} />",
            "  </div>;",
            "}",
            "",
          ].join("\n"),
          "utf-8"
        );
      });

      try {
        const result = runQualityCheck(qualityRoot);
        assertEq(
          result.status,
          1,
          `Expected failure exit code 1 for allowlist total cap exceedance, got ${result.status}`
        );
        assert(
          (result.stdout || "").includes("FAIL dangerouslySetInnerHTML usage"),
          "Expected dangerouslySetInnerHTML allowlist cap failure"
        );
      } finally {
        rmSync(qualityRoot, { recursive: true, force: true });
      }
    }
  );

  await runTest("fails when shell:true is introduced", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "scripts"), { recursive: true });
      writeFileSync(
        join(root, "scripts", "Bad.ts"),
        `const opts = { shell: true };\nconsole.log(opts);\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for shell:true usage, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL shell:true command execution"),
        "Expected shell:true guardrail failure"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when shell:true is introduced in JavaScript", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "scripts"), { recursive: true });
      writeFileSync(
        join(root, "scripts", "BadShell.js"),
        `const opts = { shell: true };\nconsole.log(opts);\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for shell:true in js, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL shell:true command execution"),
        "Expected shell:true guardrail failure for js sources"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when execSync usage is introduced", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "scripts"), { recursive: true });
      writeFileSync(
        join(root, "scripts", "BadExec.ts"),
        `import { execSync } from "node:child_process";\nexecSync("echo hi");\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for execSync usage, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL execSync usage"),
        "Expected execSync guardrail failure"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when execSync usage is introduced in JavaScript scripts", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "scripts"), { recursive: true });
      writeFileSync(
        join(root, "scripts", "BadExec.js"),
        `import { execSync } from "node:child_process";\nexecSync("echo hi");\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for execSync in js script, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL execSync usage"),
        "Expected execSync guardrail failure for js scripts"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when execSync usage is introduced in _api", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "_api"), { recursive: true });
      writeFileSync(
        join(root, "_api", "BadExecApi.ts"),
        `import { execSync } from "node:child_process";\nexport const run = () => execSync("echo hi");\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for execSync in _api, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL execSync usage"),
        "Expected execSync guardrail failure for _api"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when child_process exec import is introduced", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "scripts"), { recursive: true });
      writeFileSync(
        join(root, "scripts", "BadExecImport.ts"),
        `import { exec } from "node:child_process";\nconsole.log(exec);\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for exec import usage, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes(
          "FAIL child_process exec import usage"
        ),
        "Expected child_process exec import guardrail failure"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when child_process exec require usage is introduced", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "scripts"), { recursive: true });
      writeFileSync(
        join(root, "scripts", "BadExecRequire.js"),
        `const { exec } = require("child_process");\nconsole.log(exec);\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for exec require usage, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes(
          "FAIL child_process exec import usage"
        ),
        "Expected child_process exec import guardrail failure for require syntax"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when unsafe Prisma raw SQL method is introduced", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "_api"), { recursive: true });
      writeFileSync(
        join(root, "_api", "BadSql.ts"),
        `export async function run(prisma: any){\n  await prisma.$queryRawUnsafe("SELECT * FROM users");\n}\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for unsafe raw SQL method, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL unsafe Prisma raw SQL methods"),
        "Expected unsafe Prisma raw SQL guardrail failure"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when executeRawUnsafe variant is introduced", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "BadSqlVariant.ts"),
        `export async function run(prisma: any){\n  await prisma.$executeRawUnsafe("DELETE FROM users");\n}\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for executeRawUnsafe variant, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL unsafe Prisma raw SQL methods"),
        "Expected unsafe Prisma raw SQL guardrail failure for executeRawUnsafe"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when queryRawUnsafe variant is introduced", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "BadSqlQueryVariant.ts"),
        `export async function run(db: any){\n  await db.queryRawUnsafe("SELECT 1");\n}\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for queryRawUnsafe variant, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL unsafe Prisma raw SQL methods"),
        "Expected unsafe Prisma raw SQL guardrail failure for queryRawUnsafe"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when Prisma.raw usage is introduced", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "_api"), { recursive: true });
      writeFileSync(
        join(root, "_api", "BadPrismaRaw.ts"),
        `import { Prisma } from "@prisma/client";\nexport const sql = Prisma.raw("users");\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for Prisma.raw usage, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL Prisma.raw usage"),
        "Expected Prisma.raw guardrail failure"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when child_process exec import is introduced in _api", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "_api"), { recursive: true });
      writeFileSync(
        join(root, "_api", "BadExecApi.ts"),
        `import { exec } from "child_process";\nexport const value = exec;\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for exec import in _api, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL child_process exec import usage"),
        "Expected child_process exec import guardrail failure for _api"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when @ts-nocheck is introduced", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "NoCheck.ts"),
        `// @ts-nocheck\nexport const value = 1;\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for @ts-nocheck usage, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL @ts-nocheck comments"),
        "Expected @ts-nocheck guardrail failure"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when @ts-expect-error is introduced in scripts", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "scripts"), { recursive: true });
      writeFileSync(
        join(root, "scripts", "BadTypeSuppression.ts"),
        `// @ts-expect-error intentional test\nexport const value: number = "x";\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for @ts-expect-error in scripts, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL @ts-ignore/@ts-expect-error"),
        "Expected ts-ignore/expect-error guardrail failure for scripts"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when TODO markers are introduced", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "Todo.ts"),
        `// TODO: remove this temporary branch\nexport const value = 1;\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for TODO marker, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL TODO/FIXME/HACK markers"),
        "Expected TODO/FIXME/HACK guardrail failure"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when innerHTML assignment is introduced in JavaScript", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "BadInnerHtml.js"),
        `const el = document.createElement("div");\nel.innerHTML = "<b>x</b>";\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for innerHTML in js, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL innerHTML assignments"),
        "Expected innerHTML guardrail failure for js sources"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when outerHTML assignment is introduced in JavaScript", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "BadOuterHtml.js"),
        `const el = document.createElement("div");\nel.outerHTML = "<div>y</div>";\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for outerHTML in js, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL outerHTML assignments"),
        "Expected outerHTML guardrail failure for js sources"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when insertAdjacentHTML usage is introduced in JavaScript", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "BadInsertAdjacentHtml.js"),
        `const el = document.createElement("div");\nel.insertAdjacentHTML("beforeend", "<span>z</span>");\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for insertAdjacentHTML in js, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL insertAdjacentHTML usage"),
        "Expected insertAdjacentHTML guardrail failure for js sources"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when document.write usage is introduced in JavaScript", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "BadDocumentWrite.js"),
        `document.write("<p>oops</p>");\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for document.write in js, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL document.write usage"),
        "Expected document.write guardrail failure for js sources"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when string-based setTimeout is introduced", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "BadTimer.js"),
        `setTimeout("alert('x')", 1000);\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for string timer usage, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes(
          "FAIL string-based timer execution usage"
        ),
        "Expected string timer guardrail failure"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when template-literal setInterval is introduced", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "BadTemplateTimer.js"),
        "setInterval(`console.log('x')`, 1000);\n",
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for template-literal timer usage, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes(
          "FAIL string-based timer execution usage"
        ),
        "Expected string timer guardrail failure for template-literal timer"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when string-based setImmediate is introduced", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "scripts"), { recursive: true });
      writeFileSync(
        join(root, "scripts", "BadImmediate.js"),
        "setImmediate('console.log(1)');\n",
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for string setImmediate usage, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL string-based timer execution usage"),
        "Expected string timer guardrail failure for setImmediate"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when eval is introduced", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "BadEval.ts"),
        `export const run = (value: string) => eval(value);\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for eval usage, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes(
          "FAIL dynamic code execution (eval/new Function)"
        ),
        "Expected dynamic code execution guardrail failure"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when debugger statement is introduced", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "BadDebugger.ts"),
        `export const run = () => { debugger; return true; };\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for debugger usage, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL debugger statements"),
        "Expected debugger guardrail failure"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when merge conflict markers are introduced", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "MergeConflict.ts"),
        [
          "export const value = 1;",
          "<<<<<<< HEAD",
          "export const a = 1;",
          "=======",
          "export const a = 2;",
          ">>>>>>> feature-branch",
          "",
        ].join("\n"),
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for merge markers, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL merge conflict markers"),
        "Expected merge conflict marker guardrail failure"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when merge conflict markers are introduced in markdown", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "tests"), { recursive: true });
      writeFileSync(
        join(root, "tests", "MergeConflict.md"),
        [
          "# Example",
          "<<<<<<< HEAD",
          "left",
          "=======",
          "right",
          ">>>>>>> feature-branch",
          "",
        ].join("\n"),
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for markdown merge markers, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL merge conflict markers"),
        "Expected merge conflict marker guardrail failure for markdown"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("JSON mode returns failure status for violations", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "Todo.ts"),
        `// TODO: should fail in JSON mode\nexport const value = 1;\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheckJson(qualityRoot);
      assertEq(result.status, 1, "Expected JSON mode to return exit code 1");
      const parsed = JSON.parse(result.stdout || "{}") as {
        schemaVersion?: number;
        passed?: boolean;
        failedChecks?: number;
        checks?: Array<{ name: string; status: string }>;
      };
      assert(parsed.schemaVersion === 1, "Expected schemaVersion=1 in JSON failure output");
      assert(parsed.passed === false, "Expected passed=false in JSON failure output");
      assert(
        typeof parsed.failedChecks === "number" && parsed.failedChecks > 0,
        "Expected failedChecks metadata for failing JSON output"
      );
      assert(
        (parsed.checks || []).some(
          (check) =>
            check.name === "TODO/FIXME/HACK markers" && check.status === "FAIL"
        ),
        "Expected TODO guardrail failure entry in JSON output"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("JSON mode exposes offender entries as {path,count}", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "Todo.ts"),
        `// TODO: should fail schema check\nexport const value = 1;\n`,
        "utf-8"
      );
      // Add enough large files to trigger a size guardrail and validate shared offender shape.
      for (let i = 0; i < 30; i++) {
        writeFileWithLineCount(
          join(root, "src", `HugeSchema${i}.ts`),
          1001,
          "export const z = 1;"
        );
      }
    });

    try {
      const result = runQualityCheckJson(qualityRoot);
      assertEq(result.status, 1, "Expected JSON mode to fail for violations");
      const parsed = JSON.parse(result.stdout || "{}") as {
        checks?: Array<{
          name: string;
          status: "PASS" | "FAIL";
          offenders?: Array<{ path: unknown; count: unknown }>;
        }>;
      };
      const failedChecks = (parsed.checks || []).filter(
        (check) => check.status === "FAIL"
      );
      assert(failedChecks.length >= 2, "Expected at least two failing checks");

      for (const check of failedChecks) {
        const offenders = check.offenders || [];
        assert(offenders.length > 0, `Expected offenders for failed check: ${check.name}`);
        for (const offender of offenders) {
          assert(
            typeof offender.path === "string" && offender.path.length > 0,
            `Expected offender.path string for check ${check.name}`
          );
          assert(
            typeof offender.count === "number" && offender.count > 0,
            `Expected offender.count number for check ${check.name}`
          );
        }
      }
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest(
    "fails when biome exhaustive-deps bypass appears outside allowlist",
    async () => {
      const qualityRoot = withTempQualityRoot((root) => {
        mkdirSync(join(root, "src"), { recursive: true });
        writeFileSync(
          join(root, "src", "BadBypass.ts"),
          `// biome-ignore lint/correctness/useExhaustiveDependencies: test\nexport const y = 1;\n`,
          "utf-8"
        );
      });

      try {
        const result = runQualityCheck(qualityRoot);
        assertEq(
          result.status,
          1,
          `Expected failure exit code 1 for disallowed biome bypass comment, got ${result.status}`
        );
        assert(
          (result.stdout || "").includes(
            "FAIL biome exhaustive-deps bypass comments"
          ),
          "Expected biome exhaustive-deps bypass guardrail failure"
        );
      } finally {
        rmSync(qualityRoot, { recursive: true, force: true });
      }
    }
  );

  await runTest(
    "fails when biome exhaustive-deps bypass allowlisted total cap is exceeded",
    async () => {
      const qualityRoot = withTempQualityRoot((root) => {
        mkdirSync(join(root, "src/hooks"), { recursive: true });
        writeFileSync(
          join(root, "src/hooks/useStreamingFetch.ts"),
          [
            "// biome-ignore lint/correctness/useExhaustiveDependencies: test one",
            "const one = 1;",
            "// biome-ignore lint/correctness/useExhaustiveDependencies: test two",
            "const two = 2;",
            "export const value = one + two;",
            "",
          ].join("\n"),
          "utf-8"
        );
      });

      try {
        const result = runQualityCheck(qualityRoot);
        assertEq(
          result.status,
          1,
          `Expected failure exit code 1 for biome allowlist cap exceedance, got ${result.status}`
        );
        assert(
          (result.stdout || "").includes("FAIL biome exhaustive-deps bypass comments"),
          "Expected biome exhaustive-deps allowlist cap failure"
        );
      } finally {
        rmSync(qualityRoot, { recursive: true, force: true });
      }
    }
  );

  await runTest("fails when large file guardrail is exceeded", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      // Exceed maxFilesOverThreshold (14) with 15 files at 1501 LOC each.
      for (let i = 0; i < 15; i++) {
        writeFileWithLineCount(
          join(root, "src", `Big${i}.ts`),
          1501,
          "export const x = 1;"
        );
      }
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for large file count, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL large TypeScript files"),
        "Expected large TypeScript files guardrail failure"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("fails when very-large file guardrail is exceeded", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      // Exceed maxFilesOverThreshold (29) with 30 files at 1001 LOC each.
      for (let i = 0; i < 30; i++) {
        writeFileWithLineCount(
          join(root, "src", `Huge${i}.ts`),
          1001,
          "export const y = 1;"
        );
      }
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(
        result.status,
        1,
        `Expected failure exit code 1 for very-large file count, got ${result.status}`
      );
      assert(
        (result.stdout || "").includes("FAIL very large TypeScript files"),
        "Expected very large TypeScript files guardrail failure"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest("reports offending files in deterministic order", async () => {
    const qualityRoot = withTempQualityRoot((root) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(
        join(root, "src", "z-last.ts"),
        `// TODO: z\nexport const z = 1;\n`,
        "utf-8"
      );
      writeFileSync(
        join(root, "src", "a-first.ts"),
        `// TODO: a\nexport const a = 1;\n`,
        "utf-8"
      );
    });

    try {
      const result = runQualityCheck(qualityRoot);
      assertEq(result.status, 1, "Expected failure for TODO markers");
      const out = result.stdout || "";
      const firstIdx = out.indexOf("src/a-first.ts");
      const secondIdx = out.indexOf("src/z-last.ts");
      assert(firstIdx !== -1, "Expected first offending path in output");
      assert(secondIdx !== -1, "Expected second offending path in output");
      assert(
        firstIdx < secondIdx,
        "Expected offending files to be reported in stable sorted order"
      );
    } finally {
      rmSync(qualityRoot, { recursive: true, force: true });
    }
  });

  await runTest(
    "reports very-large file offenders in deterministic tie-break order",
    async () => {
      const qualityRoot = withTempQualityRoot((root) => {
        mkdirSync(join(root, "src"), { recursive: true });
        // Trigger the 1500+ LOC threshold with equal line counts.
        for (let i = 0; i < 13; i++) {
          writeFileWithLineCount(
            join(root, "src", `m-mid-${i}.ts`),
            1501,
            "export const q = 1;"
          );
        }
        writeFileWithLineCount(
          join(root, "src", "z-last.ts"),
          1501,
          "export const z = 1;"
        );
        writeFileWithLineCount(
          join(root, "src", "a-first.ts"),
          1501,
          "export const a = 1;"
        );
      });

      try {
        const result = runQualityCheck(qualityRoot);
        assertEq(result.status, 1, "Expected failure for large-file threshold");
        const out = result.stdout || "";
        const firstIdx = out.indexOf("src/a-first.ts");
        const secondIdx = out.indexOf("src/z-last.ts");
        assert(firstIdx !== -1, "Expected alphabetical first offender path in output");
        assert(secondIdx !== -1, "Expected alphabetical last offender path in output");
        assert(
          firstIdx < secondIdx,
          "Expected deterministic alphabetical tie-break ordering for equal LOC offenders"
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
