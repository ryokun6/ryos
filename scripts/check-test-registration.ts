import { existsSync, readFileSync } from "node:fs";
import {
  API_TEST_FILES,
  OPT_IN_TEST_FILES,
  discoverTestFiles,
  getUnitTestFiles,
} from "./test-groups";

const allTests = discoverTestFiles();
const allTestSet = new Set(allTests);
const apiSet = new Set(API_TEST_FILES);
const optInSet = new Set(OPT_IN_TEST_FILES);
const errors: string[] = [];

for (const file of [...API_TEST_FILES, ...OPT_IN_TEST_FILES]) {
  if (!existsSync(file)) {
    errors.push(`Configured test file does not exist: ${file}`);
  }
}

const duplicateConfiguredFiles = [...API_TEST_FILES, ...OPT_IN_TEST_FILES].filter(
  (file, index, files) => files.indexOf(file) !== index
);
for (const file of duplicateConfiguredFiles) {
  errors.push(`Configured test file appears more than once: ${file}`);
}

function looksLikeApiIntegration(file: string): boolean {
  const source = readFileSync(file, "utf8");
  const importsTestUtils =
    source.includes("helpers/test-utils") || source.includes("./test-utils");
  return (
    source.includes("Requires the standalone API server") ||
    source.includes("bun run dev:api") ||
    (
      importsTestUtils &&
      (
        source.includes("fetchWithOrigin") ||
        source.includes("fetchWithAuth") ||
        source.includes("BASE_URL")
      )
    )
  );
}

for (const file of allTests) {
  if (apiSet.has(file) || optInSet.has(file)) continue;
  if (looksLikeApiIntegration(file)) {
    errors.push(`API-like test is not in API_TEST_FILES or OPT_IN_TEST_FILES: ${file}`);
  }
}

for (const file of API_TEST_FILES) {
  if (allTestSet.has(file) && optInSet.has(file)) {
    errors.push(`Test file cannot be both API and opt-in: ${file}`);
  }
}

// Guard: unit suites must live under tests/unit/
for (const file of getUnitTestFiles()) {
  if (!file.startsWith("tests/unit/")) {
    errors.push(`Unit test is outside tests/unit/: ${file}`);
  }
}

// Guard: API suites must live under tests/integration/api/
for (const file of API_TEST_FILES) {
  if (!file.startsWith("tests/integration/api/")) {
    errors.push(`API test is outside tests/integration/api/: ${file}`);
  }
}

// Guard: opt-in suites must live under tests/integration/opt-in/
for (const file of OPT_IN_TEST_FILES) {
  if (!file.startsWith("tests/integration/opt-in/")) {
    errors.push(`Opt-in test is outside tests/integration/opt-in/: ${file}`);
  }
}

if (errors.length > 0) {
  console.error("Test registration check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Test registration OK: ${getUnitTestFiles().length} unit, ` +
    `${API_TEST_FILES.length} API, ${OPT_IN_TEST_FILES.length} opt-in`
);
