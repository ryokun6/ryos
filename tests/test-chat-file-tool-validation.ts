#!/usr/bin/env bun

import {
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
