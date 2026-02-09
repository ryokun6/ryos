#!/usr/bin/env bun

import {
  getEditTargetMessageBundle,
  sanitizeWriteMode,
  getEditReplacementFailureMessage,
  resolveEditTarget,
  validateDocumentWriteInput,
  validateFileEditInput,
} from "../src/apps/chats/utils/chatFileToolValidation";
import {
  assertEq,
  clearResults,
  header,
  printSummary,
  runTest,
  section,
} from "./test-utils";

export async function runChatFileToolValidationTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Chat File Tool Validation Tests"));

  console.log(section("Write input validation"));
  await runTest("rejects missing path", async () => {
    const result = validateDocumentWriteInput({
      path: "",
      content: "hello",
      mode: "overwrite",
    });
    assertEq(result.ok, false);
    if (!result.ok) {
      assertEq(result.errorKey, "apps.chats.toolCalls.noPathProvided");
    }
  });

  await runTest("rejects non-documents path", async () => {
    const result = validateDocumentWriteInput({
      path: "/Applets/demo.md",
      content: "hello",
      mode: "overwrite",
    });
    assertEq(result.ok, false);
    if (!result.ok) {
      assertEq(result.errorKey, "apps.chats.toolCalls.invalidPathForWrite");
      assertEq(result.errorParams?.path, "/Applets/demo.md");
    }
  });

  await runTest("rejects non-markdown filename", async () => {
    const result = validateDocumentWriteInput({
      path: "/Documents/demo.txt",
      content: "hello",
      mode: "overwrite",
    });
    assertEq(result.ok, false);
    if (!result.ok) {
      assertEq(result.errorKey, "apps.chats.toolCalls.invalidFilename");
      assertEq(result.errorParams?.fileName, "demo.txt");
    }
  });

  await runTest("rejects empty overwrite content", async () => {
    const result = validateDocumentWriteInput({
      path: "/Documents/demo.md",
      content: "",
      mode: "overwrite",
    });
    assertEq(result.ok, false);
    if (!result.ok) {
      assertEq(result.errorKey, "apps.chats.toolCalls.noContentProvided");
    }
  });

  await runTest("allows empty content for append and prepend", async () => {
    const append = validateDocumentWriteInput({
      path: "/Documents/demo.md",
      content: "",
      mode: "append",
    });
    const prepend = validateDocumentWriteInput({
      path: "/Documents/demo.md",
      content: "",
      mode: "prepend",
    });

    assertEq(append.ok, true);
    assertEq(prepend.ok, true);
    if (append.ok) {
      assertEq(append.mode, "append");
    }
    if (prepend.ok) {
      assertEq(prepend.mode, "prepend");
    }
  });

  await runTest("returns parsed filename for valid write input", async () => {
    const result = validateDocumentWriteInput({
      path: "/Documents/notes.md",
      content: "hello",
      mode: "overwrite",
    });
    assertEq(result.ok, true);
    if (result.ok) {
      assertEq(result.fileName, "notes.md");
      assertEq(result.mode, "overwrite");
    }
  });

  await runTest("sanitizes invalid write mode to overwrite", async () => {
    assertEq(sanitizeWriteMode("append"), "append");
    assertEq(sanitizeWriteMode("prepend"), "prepend");
    assertEq(sanitizeWriteMode("overwrite"), "overwrite");
    assertEq(sanitizeWriteMode("invalid"), "overwrite");
    assertEq(sanitizeWriteMode(undefined), "overwrite");
  });

  await runTest("valid write input returns sanitized overwrite mode", async () => {
    const result = validateDocumentWriteInput({
      path: "/Documents/notes.md",
      content: "hello",
      mode: "invalid-mode",
    });
    assertEq(result.ok, true);
    if (result.ok) {
      assertEq(result.mode, "overwrite");
    }
  });

  console.log(section("Edit input validation"));
  await runTest("rejects missing edit parameters", async () => {
    const result = validateFileEditInput({
      path: "",
      oldString: "old",
      newString: "new",
    });
    assertEq(result.ok, false);
    if (!result.ok) {
      assertEq(result.errorKey, "apps.chats.toolCalls.missingEditParameters");
    }
  });

  await runTest("rejects non-string edit payloads", async () => {
    const result = validateFileEditInput({
      path: "/Documents/file.md",
      oldString: null,
      newString: 5,
    });
    assertEq(result.ok, false);
    if (!result.ok) {
      assertEq(result.errorKey, "apps.chats.toolCalls.missingEditParameters");
    }
  });

  await runTest("returns normalized edit payload on valid input", async () => {
    const result = validateFileEditInput({
      path: "/Documents/file.md",
      oldString: "old",
      newString: "new",
    });
    assertEq(result.ok, true);
    if (result.ok) {
      assertEq(result.path, "/Documents/file.md");
      assertEq(result.oldString, "old");
      assertEq(result.newString, "new");
    }
  });

  await runTest("resolves edit targets for documents and applets", async () => {
    const documentTarget = resolveEditTarget("/Documents/file.md");
    const appletTarget = resolveEditTarget("/Applets/demo.html");
    assertEq(documentTarget.ok, true);
    assertEq(appletTarget.ok, true);
    if (documentTarget.ok) {
      assertEq(documentTarget.target, "document");
    }
    if (appletTarget.ok) {
      assertEq(appletTarget.target, "applet");
    }
  });

  await runTest("rejects edit target outside supported roots", async () => {
    const result = resolveEditTarget("/Music/song.mp3");
    assertEq(result.ok, false);
    if (!result.ok) {
      assertEq(result.errorKey, "apps.chats.toolCalls.invalidPathForEdit");
      assertEq(result.errorParams?.path, "/Music/song.mp3");
    }
  });

  await runTest("builds document and applet edit message bundles", async () => {
    const documentBundle = getEditTargetMessageBundle({
      target: "document",
      path: "/Documents/file.md",
    });
    const appletBundle = getEditTargetMessageBundle({
      target: "applet",
      path: "/Applets/demo.html",
    });

    assertEq(
      documentBundle.successKey,
      "apps.chats.toolCalls.editedDocument",
    );
    assertEq(
      appletBundle.successKey,
      "apps.chats.toolCalls.editedApplet",
    );
    assertEq(
      documentBundle.readFailed,
      "Failed to read document content: /Documents/file.md",
    );
    assertEq(
      appletBundle.readFailed,
      "Failed to read applet content: /Applets/demo.html",
    );
  });

  console.log(section("Edit replacement failure mapping"));
  await runTest("maps not_found replacement failures to oldStringNotFound key", async () => {
    const descriptor = getEditReplacementFailureMessage({
      reason: "not_found",
      occurrences: 0,
    });
    assertEq(descriptor.errorKey, "apps.chats.toolCalls.oldStringNotFound");
  });

  await runTest("maps multiple_matches failures to count-aware translation key", async () => {
    const descriptor = getEditReplacementFailureMessage({
      reason: "multiple_matches",
      occurrences: 3,
    });
    assertEq(
      descriptor.errorKey,
      "apps.chats.toolCalls.oldStringMultipleMatches",
    );
    assertEq(
      "errorParams" in descriptor ? descriptor.errorParams?.count : undefined,
      3,
    );
  });

  return printSummary();
}

if (import.meta.main) {
  runChatFileToolValidationTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
