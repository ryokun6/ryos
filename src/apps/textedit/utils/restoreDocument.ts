import type { JSONContent } from "@tiptap/core";

/**
 * Decide how a TextEdit window should fill the editor after launch or reload.
 *
 * Saved files persist only their path (the bytes live in the virtual file
 * system). Untitled and dirty documents persist their editor JSON. A reload
 * must not treat the editor's empty seed, or a launch-time copy of the file,
 * as the saved document.
 */
export interface TextEditLaunchData {
  path?: string;
  content?: string;
}

export interface TextEditRestoreInput {
  editorReady: boolean;
  /** TextEdit instance store has hydrated and this window's instance exists. */
  instanceReady: boolean;
  /** Virtual file system metadata has hydrated from IndexedDB. */
  filesHydrated: boolean;
  /** The path we would read is present in the hydrated catalog. */
  fileInCatalog: boolean;
  filePath: string | null;
  contentJson: JSONContent | null;
  hasUnsavedChanges: boolean;
  initialData?: TextEditLaunchData | null;
  /** Attempt that already finished. A new catalog key retries a miss. */
  completedAttemptKey: string | null;
}

export type TextEditRestorePlan =
  | { action: "wait" }
  | { action: "keep-draft" }
  | { action: "blank" }
  | {
      action: "load-file";
      path: string;
      attemptKey: string;
      /** Warn only when the catalog should already contain this file. */
      warnIfMissing: boolean;
    }
  | {
      action: "load-initial";
      path: string;
      content: string;
      attemptKey: string;
    };

function fileAttemptKey(path: string, fileInCatalog: boolean): string {
  return `file\0${path}\0${fileInCatalog ? "1" : "0"}`;
}

export function planTextEditRestore(
  input: TextEditRestoreInput
): TextEditRestorePlan {
  if (!input.editorReady || !input.instanceReady) {
    return { action: "wait" };
  }

  const hasContent = input.contentJson != null;
  const filePath = input.filePath;

  // Untitled drafts and unsaved edits are the document. Don't replace them
  // with whatever is currently on disk, and don't wait for the file catalog.
  if (hasContent && (input.hasUnsavedChanges || !filePath)) {
    return { action: "keep-draft" };
  }

  // Save / Save As already mirrored the editor into this instance. Reloading
  // the file would race the user's latest keystrokes.
  if (filePath && hasContent) {
    return { action: "keep-draft" };
  }

  if (filePath) {
    if (!input.filesHydrated) return { action: "wait" };
    const attemptKey = fileAttemptKey(filePath, input.fileInCatalog);
    if (input.completedAttemptKey === attemptKey) return { action: "blank" };
    return {
      action: "load-file",
      path: filePath,
      attemptKey,
      warnIfMissing: input.fileInCatalog,
    };
  }

  const initialPath = input.initialData?.path;
  if (initialPath) {
    const initialContent = input.initialData?.content;
    // Inline launch content is the file as of open. An empty string is not a
    // document — the bytes may not have been read yet.
    if (typeof initialContent === "string" && initialContent.length > 0) {
      const attemptKey = `initial\0${initialPath}`;
      if (input.completedAttemptKey === attemptKey) return { action: "keep-draft" };
      return {
        action: "load-initial",
        path: initialPath,
        content: initialContent,
        attemptKey,
      };
    }

    if (!input.filesHydrated) return { action: "wait" };
    const attemptKey = fileAttemptKey(initialPath, input.fileInCatalog);
    if (input.completedAttemptKey === attemptKey) return { action: "blank" };
    return {
      action: "load-file",
      path: initialPath,
      attemptKey,
      warnIfMissing: input.fileInCatalog,
    };
  }

  return { action: "blank" };
}

/**
 * The editor mounts empty. Mirroring that seed into the instance store marks a
 * saved file dirty and blocks the file read that should fill it.
 */
export function shouldMirrorEditorContent(input: {
  plan: TextEditRestorePlan;
  userEditedDuringRestore: boolean;
}): boolean {
  if (input.userEditedDuringRestore) return true;
  return input.plan.action === "keep-draft" || input.plan.action === "blank";
}
