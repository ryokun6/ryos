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

// Bun 1.4 ignores `[test].timeout` in bunfig.toml and defaults to 5s.
const child = Bun.spawn(["bun", "test", "--timeout=30000", ...files], {
  stdout: "inherit",
  stderr: "inherit",
});

process.exit(await child.exited);
