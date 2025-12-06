#!/usr/bin/env bun
/**
 * Main test runner - runs all API endpoint tests
 * Run with: bun run tests/run-all-tests.ts
 */

import { runChatRoomsTests } from "./test-chat-rooms";
import { runIframeCheckTests } from "./test-iframe-check";
import { runLinkPreviewTests } from "./test-link-preview";
import { runParseTitleTests } from "./test-parse-title";
import { runLyricsTests } from "./test-lyrics";
import { runSpeechTests } from "./test-speech";
import { runTranslateLyricsTests } from "./test-translate-lyrics";
import { runShareAppletTests } from "./test-share-applet";

const BASE_URL = process.env.API_URL || "http://localhost:3000";

interface TestSuiteResult {
  name: string;
  passed: number;
  failed: number;
}

// Box drawing characters
const BOX = {
  TOP_LEFT: "┌",
  TOP_RIGHT: "┐",
  BOTTOM_LEFT: "└",
  BOTTOM_RIGHT: "┘",
  HORIZONTAL: "─",
  VERTICAL: "│",
  T_RIGHT: "├",
  T_LEFT: "┤",
};

function line(width: number = 70): string {
  return BOX.HORIZONTAL.repeat(width);
}

function header(text: string, width: number = 70): string {
  const padding = width - text.length - 4;
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;
  return [
    `${BOX.TOP_LEFT}${line(width - 2)}${BOX.TOP_RIGHT}`,
    `${BOX.VERTICAL} ${" ".repeat(leftPad)}${text}${" ".repeat(rightPad)} ${BOX.VERTICAL}`,
    `${BOX.BOTTOM_LEFT}${line(width - 2)}${BOX.BOTTOM_RIGHT}`,
  ].join("\n");
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

async function runAllTests(): Promise<void> {
  console.log("\n" + header("API ENDPOINT TESTS"));
  console.log(`\n  Server: ${BASE_URL}\n`);

  const results: TestSuiteResult[] = [];
  const startTime = Date.now();

  // Define test suites
  const testSuites: { name: string; run: () => Promise<{ passed: number; failed: number }> }[] = [
    { name: "chat-rooms", run: runChatRoomsTests },
    { name: "iframe-check", run: runIframeCheckTests },
    { name: "link-preview", run: runLinkPreviewTests },
    { name: "parse-title", run: runParseTitleTests },
    { name: "lyrics", run: runLyricsTests },
    { name: "speech", run: runSpeechTests },
    { name: "translate-lyrics", run: runTranslateLyricsTests },
    { name: "share-applet", run: runShareAppletTests },
  ];

  // Check for specific test to run
  const specificTest = process.argv[2];
  const suitesToRun = specificTest
    ? testSuites.filter((s) => s.name.includes(specificTest))
    : testSuites;

  if (specificTest && suitesToRun.length === 0) {
    console.error(`  Error: No test suite found matching "${specificTest}"\n`);
    console.log("  Available test suites:");
    testSuites.forEach((s) => console.log(`    - ${s.name}`));
    console.log("");
    process.exit(1);
  }

  // Run test suites
  for (const suite of suitesToRun) {
    try {
      const result = await suite.run();
      results.push({ name: suite.name, ...result });
    } catch (error) {
      console.error(`\n  Error running ${suite.name} tests:`, error);
      results.push({ name: suite.name, passed: 0, failed: 1 });
    }
  }

  // Print overall summary
  const totalDuration = Date.now() - startTime;
  const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);

  console.log("\n" + header("SUMMARY"));

  // Results table
  const maxNameLen = Math.max(...results.map((r) => r.name.length), 12);
  
  console.log(`\n  ${"Suite".padEnd(maxNameLen)}  Passed  Failed  Status`);
  console.log(`  ${line(maxNameLen + 24)}`);
  
  for (const result of results) {
    const status = result.failed === 0 ? "ok" : "FAILED";
    const name = result.name.padEnd(maxNameLen);
    const passed = String(result.passed).padStart(6);
    const failed = String(result.failed).padStart(6);
    console.log(`  ${name}  ${passed}  ${failed}  ${status}`);
  }

  console.log(`  ${line(maxNameLen + 24)}`);
  console.log(`  ${"Total".padEnd(maxNameLen)}  ${String(totalPassed).padStart(6)}  ${String(totalFailed).padStart(6)}`);

  console.log(`\n  Duration: ${formatDuration(totalDuration)}`);

  if (totalFailed > 0) {
    console.log("\n  Status: FAILED\n");
    process.exit(1);
  } else {
    console.log("\n  Status: PASSED\n");
    process.exit(0);
  }
}

// Run
runAllTests().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
