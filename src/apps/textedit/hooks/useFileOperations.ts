import { useCallback } from "react";
import { Editor } from "@tiptap/core";
import { useVfsFileOperations } from "@/services/vfs/useVfsFileOperations";
import { readDocumentTextContent } from "@/services/vfs/FileContentRepository";
import {
  htmlToMarkdown,
  htmlToPlainText,
} from "@/utils/markdown";
import { markdownToSafeHtml } from "../utils/markdownPaste";
import {
  removeFileExtension,
  generateSuggestedFilename,
} from "../utils/textEditUtils";
import {
  parseRichMarkdown,
  serializeRichMarkdown,
} from "../utils/richMarkdown";
import { TEXTEDIT_ANALYTICS, track } from "@/utils/analytics";
import { saveBlobToDevice } from "@/utils/nativeFileDialogs";
import { textEditLog as log } from "../logging";

interface UseFileOperationsProps {
  editor: Editor | null;
  currentFilePath: string | null;
  customTitle?: string;
  onSaveSuccess?: (filePath: string) => void;
  onLoadSuccess?: (filePath: string) => void;
}

export function useFileOperations({
  editor,
  currentFilePath,
  customTitle,
  onSaveSuccess,
  onLoadSuccess,
}: UseFileOperationsProps) {
  const { saveFile } = useVfsFileOperations("/Documents");

  const handleSave = useCallback(async (): Promise<void> => {
    if (!editor) return;

    if (!currentFilePath) {
      throw new Error("No file path provided - use handleSaveAs instead");
    }

    try {
      const htmlContent = editor.getHTML();
      const markdownContent = htmlToMarkdown(htmlContent);
      const persistedContent = serializeRichMarkdown(
        markdownContent,
        editor.getJSON()
      );

      await saveFile({
        name: currentFilePath.split("/").pop() || "Untitled.md",
        path: currentFilePath,
        content: persistedContent,
      });

      track(TEXTEDIT_ANALYTICS.SAVE, { appId: "textedit", format: "md" });
      onSaveSuccess?.(currentFilePath);
      log.debug("File saved successfully", { path: currentFilePath });
    } catch (error) {
      console.error("[TextEdit] Failed to save file:", error);
      throw error;
    }
  }, [editor, currentFilePath, saveFile, onSaveSuccess]);

  const handleSaveAs = useCallback(
    async (
      fileName: string,
      directoryPath: string = "/Documents"
    ): Promise<string> => {
      if (!editor) throw new Error("Editor not available");

      const basePath = directoryPath === "/" ? "" : directoryPath;
      const filePath = `${basePath}/${fileName}${
        fileName.endsWith(".md") ? "" : ".md"
      }`;

      try {
        const htmlContent = editor.getHTML();
        const markdownContent = htmlToMarkdown(htmlContent);
        const persistedContent = serializeRichMarkdown(
          markdownContent,
          editor.getJSON()
        );

        await saveFile({
          name: fileName.endsWith(".md") ? fileName : `${fileName}.md`,
          path: filePath,
          content: persistedContent,
        });

        track(TEXTEDIT_ANALYTICS.SAVE_AS, { appId: "textedit", format: "md" });
        onSaveSuccess?.(filePath);
        log.debug("File saved successfully", { path: filePath });
        return filePath;
      } catch (error) {
        console.error("[TextEdit] Failed to save file:", error);
        throw error;
      }
    },
    [editor, saveFile, onSaveSuccess]
  );

  const handleImportFile = useCallback(
    async (file: File): Promise<string> => {
      if (!editor) throw new Error("Editor not available");

      const filePath = `/Documents/${file.name}`;
      const text = await file.text();

      // Convert content based on file type
      let editorContent: string;
      if (file.name.endsWith(".html")) {
        editorContent = text;
      } else if (file.name.endsWith(".md")) {
        const parsed = parseRichMarkdown(text);
        if (parsed.editorJson) {
          editor.commands.setContent(parsed.editorJson, false);
          editorContent = "";
        } else {
          editorContent = markdownToSafeHtml(parsed.markdown);
        }
      } else {
        editorContent = `<p>${text}</p>`;
      }

      if (editorContent) {
        editor.commands.setContent(editorContent, false);
      }

      // Always save in markdown format with rich metadata
      const markdownContent = htmlToMarkdown(editor.getHTML());
      const persistedContent = serializeRichMarkdown(
        markdownContent,
        editor.getJSON()
      );

      try {
        await saveFile({
          name: file.name,
          path: filePath,
          content: persistedContent,
        });

        track(TEXTEDIT_ANALYTICS.IMPORT, {
          appId: "textedit",
          extension: file.name.split(".").pop()?.toLowerCase() || "unknown",
          sizeBucket:
            file.size <= 10_000 ? "small" : file.size <= 100_000 ? "medium" : "large",
        });
        onLoadSuccess?.(filePath);
        log.debug("File imported successfully", { path: filePath });
        return filePath;
      } catch (error) {
        console.error("[TextEdit] Failed to import file:", error);
        throw error;
      }
    },
    [editor, saveFile, onLoadSuccess]
  );

  const handleExportFile = useCallback(
    async (format: "html" | "md" | "txt") => {
      if (!editor) return;

      const html = editor.getHTML();
      let content: string;
      let mimeType: string;
      let extension: string;

      switch (format) {
        case "md":
          content = htmlToMarkdown(html);
          mimeType = "text/markdown";
          extension = "md";
          break;
        case "txt":
          content = htmlToPlainText(html);
          mimeType = "text/plain";
          extension = "txt";
          break;
        case "html":
        default:
          content = html;
          mimeType = "text/html";
          extension = "html";
          break;
      }

      const filename = currentFilePath
        ? removeFileExtension(currentFilePath.split("/").pop() || "")
        : "Untitled";

      const blob = new Blob([content], { type: mimeType });
      await saveBlobToDevice(blob, `${filename}.${extension}`, {
        filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
      });
      track(TEXTEDIT_ANALYTICS.EXPORT, { appId: "textedit", format });
    },
    [editor, currentFilePath]
  );

  const handleLoadFromPath = useCallback(
    async (path: string, content: string | undefined): Promise<void> => {
      if (!editor) return;

      const contentToUse = typeof content === "string" ? content : "";
      let editorContent: string | object;

      if (path.endsWith(".md")) {
        const parsed = parseRichMarkdown(contentToUse);
        if (parsed.editorJson) {
          editorContent = parsed.editorJson as object;
        } else {
          editorContent = markdownToSafeHtml(parsed.markdown);
        }
      } else {
        try {
          editorContent = JSON.parse(contentToUse);
        } catch {
          editorContent = `<p>${contentToUse}</p>`;
        }
      }

      editor.commands.setContent(editorContent, false);
      onLoadSuccess?.(path);
    },
    [editor, onLoadSuccess]
  );

  const handleLoadFromDatabase = useCallback(
    async (filePath: string): Promise<boolean> => {
      if (!editor) return false;

      try {
        const contentStr = await readDocumentTextContent(filePath);
        if (contentStr) {
          let editorContent;

          if (filePath.endsWith(".md")) {
            const parsed = parseRichMarkdown(contentStr);
            if (parsed.editorJson) {
              editorContent = parsed.editorJson;
            } else {
              editorContent = markdownToSafeHtml(parsed.markdown);
            }
          } else {
            try {
              editorContent = JSON.parse(contentStr);
            } catch {
              editorContent = `<p>${contentStr}</p>`;
            }
          }

          if (editorContent) {
            editor.commands.setContent(editorContent, false);
            onLoadSuccess?.(filePath);
            log.debug("Loaded content from file", { path: filePath });
            return true;
          }
        } else {
          console.warn("Document not found or empty:", filePath);
        }
      } catch (err) {
        console.error("Error loading file content from DB:", err);
      }

      return false;
    },
    [editor, onLoadSuccess]
  );

  const generateSuggestedFileName = useCallback((): string => {
    return generateSuggestedFilename(customTitle, editor);
  }, [customTitle, editor]);

  return {
    handleSave,
    handleSaveAs,
    handleImportFile,
    handleExportFile,
    handleLoadFromPath,
    handleLoadFromDatabase,
    generateSuggestedFileName,
  };
}
