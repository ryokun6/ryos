#!/usr/bin/env bun
/**
 * Main test runner - runs all API endpoint tests
 * Run with: bun run tests/run-all-tests.ts
 */

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

async function runAllTests(): Promise<void> {
  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                    API ENDPOINT TESTS                       ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log(`\n🌐 Testing against: ${BASE_URL}\n`);

  const results: TestSuiteResult[] = [];
  const startTime = Date.now();

  // Define test suites
  const testSuites: { name: string; run: () => Promise<{ passed: number; failed: number }> }[] = [
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
    console.error(`❌ No test suite found matching: ${specificTest}`);
    console.log("\nAvailable test suites:");
    testSuites.forEach((s) => console.log(`  - ${s.name}`));
    process.exit(1);
  }

  // Run test suites
  for (const suite of suitesToRun) {
    try {
      const result = await suite.run();
      results.push({ name: suite.name, ...result });
    } catch (error) {
      console.error(`\n❌ Error running ${suite.name} tests:`, error);
      results.push({ name: suite.name, passed: 0, failed: 1 });
    }
  }

  // Print overall summary
  const totalDuration = Date.now() - startTime;
  const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);

  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                    OVERALL SUMMARY                          ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("\n📊 Results by Test Suite:\n");
  
  const maxNameLen = Math.max(...results.map((r) => r.name.length));
  for (const result of results) {
    const status = result.failed === 0 ? "✅" : "❌";
    const name = result.name.padEnd(maxNameLen);
    console.log(`   ${status} ${name}  Passed: ${result.passed}, Failed: ${result.failed}`);
  }

  console.log("\n" + "─".repeat(60));
  console.log(`\n📈 Total Tests: ${totalPassed + totalFailed}`);
  console.log(`   ✅ Passed: ${totalPassed}`);
  console.log(`   ❌ Failed: ${totalFailed}`);
  console.log(`   ⏱️  Duration: ${(totalDuration / 1000).toFixed(2)}s`);

  if (totalFailed > 0) {
    console.log("\n❌ Some tests failed!\n");
    process.exit(1);
  } else {
    console.log("\n✅ All tests passed!\n");
    process.exit(0);
  }
}

// Run
runAllTests().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
