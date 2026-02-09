#!/usr/bin/env bun
/**
 * Main test runner - runs all API endpoint tests
 * Run with: bun run tests/run-all-tests.ts
 */

import { runNewApiTests } from "./test-new-api";
import { runAdminTests } from "./test-admin";
import { runIframeCheckTests } from "./test-iframe-check";
import { runLinkPreviewTests } from "./test-link-preview";
import { runParseTitleTests } from "./test-parse-title";
import { runSpeechTests } from "./test-speech";
import { runShareAppletTests } from "./test-share-applet";
import { runSongTests } from "./test-song";
import { runAiTests } from "./test-ai";
import { runMediaTests } from "./test-media";
import { runAuthExtraTests } from "./test-auth-extra";
import { runRoomsExtraTests } from "./test-rooms-extra";
import { runChatNotificationLogicTests } from "./test-chat-notification-logic";
import { runChatNotificationIntegrationWiringTests } from "./test-chat-notification-integration-wiring";
import { runPusherClientRefcountTests } from "./test-pusher-client-refcount";
import { runPusherClientConstructorWiringTests } from "./test-pusher-client-constructor-wiring";
import { runChatBroadcastWiringTests } from "./test-chat-broadcast-wiring";
import { runChatStoreGuardsWiringTests } from "./test-chat-store-guards-wiring";
import { runChatHookChannelLifecycleWiringTests } from "./test-chat-hook-channel-lifecycle-wiring";
import { runChatRuntimeUtilsTests } from "./test-chat-runtime-utils";
import { runChatStoreStateHelpersTests } from "./test-chat-store-state-helpers";
import { runChatLocalFileContentTests } from "./test-chat-local-file-content";
import { runChatRoomMessageMergeLogicTests } from "./test-chat-room-message-merge-logic";
import { runChatTranscriptTests } from "./test-chat-transcript";
import { runChatTextEditDocumentSyncCoreTests } from "./test-chat-textedit-document-sync-core";
import { runChatFileToolValidationTests } from "./test-chat-file-tool-validation";
import { runChatFileEditOperationTests } from "./test-chat-file-edit-operation";
import { runChatFileWriteOperationTests } from "./test-chat-file-write-operation";
import { runChatFileToolHandlersTests } from "./test-chat-file-tool-handlers";
import { runChatFileReadOperationTests } from "./test-chat-file-read-operation";
import { runChatSharedAppletReadOperationTests } from "./test-chat-shared-applet-read-operation";
import { runChatFileOpenOperationTests } from "./test-chat-file-open-operation";
import { runChatListOperationTests } from "./test-chat-list-operation";
import { runChatAppHandlersTests } from "./test-chat-app-handlers";
import { runChatGenerateHtmlToolHandlerTests } from "./test-chat-generate-html-tool-handler";
import { runChatAquariumHandlerTests } from "./test-chat-aquarium-handler";

const BASE_URL = process.env.API_URL || "http://localhost:3000";

interface TestSuiteResult {
  name: string;
  passed: number;
  failed: number;
}

// ANSI color codes
const COLOR = {
  RESET: "\x1b[0m",
  BOLD: "\x1b[1m",
  DIM: "\x1b[2m",
  GREEN: "\x1b[32m",
  RED: "\x1b[31m",
  YELLOW: "\x1b[33m",
  CYAN: "\x1b[36m",
  WHITE: "\x1b[37m",
};

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
  console.log(`\n  Server: ${COLOR.CYAN}${BASE_URL}${COLOR.RESET}\n`);

  const results: TestSuiteResult[] = [];
  const startTime = Date.now();

  // Define test suites
  const testSuites: { name: string; run: () => Promise<{ passed: number; failed: number }> }[] = [
    { name: "new-api", run: runNewApiTests },
    { name: "admin", run: runAdminTests },
    { name: "iframe-check", run: runIframeCheckTests },
    { name: "link-preview", run: runLinkPreviewTests },
    { name: "parse-title", run: runParseTitleTests },
    { name: "song", run: runSongTests },
    { name: "speech", run: runSpeechTests },
    { name: "share-applet", run: runShareAppletTests },
    { name: "ai", run: runAiTests },
    { name: "media", run: runMediaTests },
    { name: "auth-extra", run: runAuthExtraTests },
    { name: "rooms-extra", run: runRoomsExtraTests },
    { name: "chat-notifications", run: runChatNotificationLogicTests },
    { name: "chat-notification-wiring", run: runChatNotificationIntegrationWiringTests },
    { name: "chat-hook-lifecycle-wiring", run: runChatHookChannelLifecycleWiringTests },
    { name: "chat-file-tool-validation", run: runChatFileToolValidationTests },
    { name: "chat-runtime-utils", run: runChatRuntimeUtilsTests },
    { name: "chat-store-state-helpers", run: runChatStoreStateHelpersTests },
    { name: "chat-local-file-content", run: runChatLocalFileContentTests },
    { name: "chat-room-message-merge-logic", run: runChatRoomMessageMergeLogicTests },
    { name: "chat-transcript", run: runChatTranscriptTests },
    { name: "chat-textedit-document-sync-core", run: runChatTextEditDocumentSyncCoreTests },
    { name: "chat-file-edit-operation", run: runChatFileEditOperationTests },
    { name: "chat-file-write-operation", run: runChatFileWriteOperationTests },
    { name: "chat-file-tool-handlers", run: runChatFileToolHandlersTests },
    { name: "chat-file-read-operation", run: runChatFileReadOperationTests },
    { name: "chat-shared-applet-read-operation", run: runChatSharedAppletReadOperationTests },
    { name: "chat-file-open-operation", run: runChatFileOpenOperationTests },
    { name: "chat-list-operation", run: runChatListOperationTests },
    { name: "chat-app-handlers", run: runChatAppHandlersTests },
    { name: "chat-generate-html-tool-handler", run: runChatGenerateHtmlToolHandlerTests },
    { name: "chat-aquarium-handler", run: runChatAquariumHandlerTests },
    { name: "pusher-client", run: runPusherClientRefcountTests },
    { name: "pusher-constructor-wiring", run: runPusherClientConstructorWiringTests },
    { name: "chat-broadcast-wiring", run: runChatBroadcastWiringTests },
    { name: "chat-store-guards", run: runChatStoreGuardsWiringTests },
  ];

  // Check for specific test to run
  const specificTest = process.argv[2];
  const suitesToRun = specificTest
    ? testSuites.filter((s) => s.name.includes(specificTest))
    : testSuites;

  if (specificTest && suitesToRun.length === 0) {
    console.error(`  ${COLOR.RED}Error:${COLOR.RESET} No test suite found matching "${specificTest}"\n`);
    console.log("  Available test suites:");
    testSuites.forEach((s) => console.log(`    ${COLOR.DIM}-${COLOR.RESET} ${s.name}`));
    console.log("");
    process.exit(1);
  }

  // Run test suites
  for (const suite of suitesToRun) {
    try {
      const result = await suite.run();
      results.push({ name: suite.name, ...result });
    } catch (error) {
      console.error(`\n  ${COLOR.RED}Error running ${suite.name} tests:${COLOR.RESET}`, error);
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
  
  console.log(`\n  ${COLOR.BOLD}${"Suite".padEnd(maxNameLen)}  Passed  Failed  Status${COLOR.RESET}`);
  console.log(`  ${line(maxNameLen + 24)}`);
  
  for (const result of results) {
    const isOk = result.failed === 0;
    const status = isOk 
      ? `${COLOR.GREEN}ok${COLOR.RESET}` 
      : `${COLOR.RED}FAILED${COLOR.RESET}`;
    const name = result.name.padEnd(maxNameLen);
    const passed = `${COLOR.GREEN}${String(result.passed).padStart(6)}${COLOR.RESET}`;
    const failed = result.failed > 0 
      ? `${COLOR.RED}${String(result.failed).padStart(6)}${COLOR.RESET}`
      : `${COLOR.DIM}${String(result.failed).padStart(6)}${COLOR.RESET}`;
    console.log(`  ${name}  ${passed}  ${failed}  ${status}`);
  }

  console.log(`  ${line(maxNameLen + 24)}`);
  const totalPassedStr = `${COLOR.GREEN}${String(totalPassed).padStart(6)}${COLOR.RESET}`;
  const totalFailedStr = totalFailed > 0 
    ? `${COLOR.RED}${String(totalFailed).padStart(6)}${COLOR.RESET}`
    : `${COLOR.DIM}${String(totalFailed).padStart(6)}${COLOR.RESET}`;
  console.log(`  ${COLOR.BOLD}${"Total".padEnd(maxNameLen)}${COLOR.RESET}  ${totalPassedStr}  ${totalFailedStr}`);

  console.log(`\n  Duration: ${COLOR.DIM}${formatDuration(totalDuration)}${COLOR.RESET}`);

  if (totalFailed > 0) {
    console.log(`\n  Status: ${COLOR.RED}${COLOR.BOLD}FAILED${COLOR.RESET}\n`);
    process.exit(1);
  } else {
    console.log(`\n  Status: ${COLOR.GREEN}${COLOR.BOLD}PASSED${COLOR.RESET}\n`);
    process.exit(0);
  }
}

// Run
runAllTests().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
