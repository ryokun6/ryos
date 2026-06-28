import { API_TEST_FILES, getUnitTestFiles } from "./test-groups";

const group = process.argv[2];

if (group !== "unit" && group !== "api") {
  console.error("Usage: bun run scripts/run-test-group.ts <unit|api>");
  process.exit(1);
}

const files = group === "unit" ? getUnitTestFiles() : API_TEST_FILES;

if (files.length === 0) {
  console.error(`No ${group} test files found`);
  process.exit(1);
}

console.log(`Running ${files.length} ${group} test files`);

let failedFiles = 0;
// Run every file in its own Bun process. API files still share the standalone
// server, but cannot leak mocked clocks or globals into later suites.
for (const file of files) {
  // This suite statically imports every persisted store. Install happy-dom
  // before module evaluation so Zustand captures a real window.localStorage.
  const needsHappyDomAtImport =
    file === "tests/test-sync-v2-codecs.test.ts";
  const child = Bun.spawn(["bun", "test", file], {
    env: {
      ...process.env,
      ...(needsHappyDomAtImport
        ? { RYOS_TEST_GLOBAL_DOM: "happy-dom" }
        : {}),
    },
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await child.exited) !== 0) {
    failedFiles++;
  }
}

if (failedFiles > 0) {
  console.error(`${failedFiles} ${group} test file(s) failed`);
  process.exit(1);
}
