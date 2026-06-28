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

const child = Bun.spawn(["bun", "test", ...files], {
  stdout: "inherit",
  stderr: "inherit",
});

process.exit(await child.exited);
