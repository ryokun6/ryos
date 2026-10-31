#!/usr/bin/env bun

import { describe, expect, test } from "bun:test";
import type { JSONContent } from "@tiptap/core";
import { contentJsonForPersist } from "../../../src/stores/useTextEditStore";
import { formatTextEditWindowTitle } from "../../../src/apps/textedit/utils/textEditUtils";
import {
  planTextEditRestore,
  shouldMirrorEditorContent,
  type TextEditRestoreInput,
} from "../../../src/apps/textedit/utils/restoreDocument";

const savedDoc: JSONContent = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Saved notes" }],
    },
  ],
};

function restoreInput(
  overrides: Partial<TextEditRestoreInput> = {}
): TextEditRestoreInput {
  return {
    editorReady: true,
    instanceReady: true,
    filesHydrated: true,
    fileInCatalog: true,
    filePath: null,
    contentJson: null,
    hasUnsavedChanges: false,
    initialData: null,
    completedAttemptKey: null,
    ...overrides,
  };
}

describe("TextEdit persisted instance content", () => {
  test("keeps untitled drafts and unsaved edits, and drops clean saved copies", () => {
    expect(
      contentJsonForPersist({
        filePath: null,
        contentJson: savedDoc,
        hasUnsavedChanges: true,
      })
    ).toBe(savedDoc);

    expect(
      contentJsonForPersist({
        filePath: null,
        contentJson: savedDoc,
        hasUnsavedChanges: false,
      })
    ).toBe(savedDoc);

    expect(
      contentJsonForPersist({
        filePath: "/Documents/Notes.md",
        contentJson: savedDoc,
        hasUnsavedChanges: true,
      })
    ).toBe(savedDoc);

    expect(
      contentJsonForPersist({
        filePath: "/Documents/Notes.md",
        contentJson: savedDoc,
        hasUnsavedChanges: false,
      })
    ).toBeNull();
  });
});

describe("TextEdit restore plan", () => {
  test("waits to read a saved file until the virtual file system has hydrated", () => {
    expect(
      planTextEditRestore(
        restoreInput({
          filePath: "/Documents/Notes.md",
          filesHydrated: false,
          fileInCatalog: false,
        })
      )
    ).toEqual({ action: "wait" });
  });

  test("reads each restored saved window from its own path", () => {
    const notes = planTextEditRestore(
      restoreInput({ filePath: "/Documents/Notes.md" })
    );
    const letter = planTextEditRestore(
      restoreInput({ filePath: "/Documents/Letter.md" })
    );

    expect(notes).toMatchObject({
      action: "load-file",
      path: "/Documents/Notes.md",
    });
    expect(letter).toMatchObject({
      action: "load-file",
      path: "/Documents/Letter.md",
    });
    expect(notes).not.toEqual(letter);
  });

  test("retries a saved file when cloud sync adds it to the catalog", () => {
    const missing = planTextEditRestore(
      restoreInput({
        filePath: "/Documents/Synced.md",
        fileInCatalog: false,
      })
    );
    expect(missing).toMatchObject({
      action: "load-file",
      path: "/Documents/Synced.md",
      warnIfMissing: false,
    });

    const finishedMiss = planTextEditRestore(
      restoreInput({
        filePath: "/Documents/Synced.md",
        fileInCatalog: false,
        completedAttemptKey:
          missing.action === "load-file" ? missing.attemptKey : "",
      })
    );
    expect(finishedMiss).toEqual({ action: "blank" });

    expect(
      planTextEditRestore(
        restoreInput({
          filePath: "/Documents/Synced.md",
          fileInCatalog: true,
          completedAttemptKey:
            missing.action === "load-file" ? missing.attemptKey : "",
        })
      )
    ).toMatchObject({
      action: "load-file",
      path: "/Documents/Synced.md",
      warnIfMissing: true,
    });
  });

  test("keeps untitled and dirty documents instead of reading storage", () => {
    expect(
      planTextEditRestore(
        restoreInput({
          contentJson: savedDoc,
          hasUnsavedChanges: true,
          filesHydrated: false,
        })
      )
    ).toEqual({ action: "keep-draft" });

    expect(
      planTextEditRestore(
        restoreInput({
          filePath: "/Documents/Notes.md",
          contentJson: savedDoc,
          hasUnsavedChanges: true,
          filesHydrated: false,
        })
      )
    ).toEqual({ action: "keep-draft" });
  });

  test("does not reload a file that Save or Save As just wrote into the instance", () => {
    expect(
      planTextEditRestore(
        restoreInput({
          filePath: "/Documents/Notes.md",
          contentJson: savedDoc,
          hasUnsavedChanges: false,
        })
      )
    ).toEqual({ action: "keep-draft" });
  });

  test("uses launch content for a fresh open and the file for a restored path", () => {
    expect(
      planTextEditRestore(
        restoreInput({
          filesHydrated: false,
          initialData: {
            path: "/Documents/Notes.md",
            content: "Hello from Finder",
          },
        })
      )
    ).toMatchObject({
      action: "load-initial",
      path: "/Documents/Notes.md",
      content: "Hello from Finder",
    });

    expect(
      planTextEditRestore(
        restoreInput({
          filePath: "/Documents/Notes.md",
          initialData: {
            path: "/Documents/Notes.md",
            content: "stale launch copy",
          },
        })
      )
    ).toMatchObject({
      action: "load-file",
      path: "/Documents/Notes.md",
    });
  });

  test("does not treat an empty launch payload as the saved document", () => {
    expect(
      planTextEditRestore(
        restoreInput({
          fileInCatalog: true,
          initialData: { path: "/Documents/Notes.md", content: "" },
        })
      )
    ).toMatchObject({
      action: "load-file",
      path: "/Documents/Notes.md",
    });
  });

  test("leaves a new untitled window blank", () => {
    expect(planTextEditRestore(restoreInput())).toEqual({ action: "blank" });
  });

  test("does not mirror the empty editor seed while a file read is pending", () => {
    const waiting = planTextEditRestore(
      restoreInput({
        filePath: "/Documents/Notes.md",
        filesHydrated: false,
      })
    );
    expect(
      shouldMirrorEditorContent({
        plan: waiting,
        userEditedDuringRestore: false,
      })
    ).toBe(false);

    expect(
      shouldMirrorEditorContent({
        plan: waiting,
        userEditedDuringRestore: true,
      })
    ).toBe(true);

    expect(
      shouldMirrorEditorContent({
        plan: { action: "keep-draft" },
        userEditedDuringRestore: false,
      })
    ).toBe(true);
  });
});

describe("TextEdit window title", () => {
  test("shows the saved file name after Save and Save As", () => {
    expect(
      formatTextEditWindowTitle({
        customTitle: "Untitled",
        filePath: "/Documents/Meeting Notes.md",
        dirty: false,
        untitledLabel: "Untitled",
      })
    ).toBe("Meeting Notes");

    expect(
      formatTextEditWindowTitle({
        customTitle: "Untitled",
        filePath: "/Documents/Meeting Notes.md",
        dirty: true,
        untitledLabel: "Untitled",
      })
    ).toBe("Meeting Notes •");
  });

  test("keeps the untitled label when the document has no path", () => {
    expect(
      formatTextEditWindowTitle({
        customTitle: "Untitled",
        filePath: null,
        dirty: false,
        untitledLabel: "Untitled",
      })
    ).toBe("Untitled");

    expect(
      formatTextEditWindowTitle({
        filePath: null,
        dirty: true,
        untitledLabel: "Untitled",
      })
    ).toBe("Untitled •");
  });
});
