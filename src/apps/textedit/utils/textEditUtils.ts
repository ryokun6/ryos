import { Editor } from "@tiptap/core";

export const removeFileExtension = (filename: string): string => {
  return filename.replace(/\.[^/.]+$/, "");
};

/**
 * Window title for a TextEdit instance. A saved path wins over a launch title
 * such as "Untitled", so Save and Save As rename the window to the file.
 */
export function formatTextEditWindowTitle({
  customTitle,
  filePath,
  dirty,
  untitledLabel,
}: {
  customTitle?: string;
  filePath: string | null;
  dirty: boolean;
  untitledLabel: string;
}): string {
  const fileName = filePath?.split("/").pop() || "";
  const base = filePath
    ? removeFileExtension(fileName) || untitledLabel
    : customTitle?.trim() || untitledLabel;
  return dirty ? `${base} •` : base;
}

export const getContentAsString = async (
  content: string | Blob | undefined
): Promise<string> => {
  if (!content) return "";
  if (content instanceof Blob) {
    return await content.text();
  }
  return content;
};

export const generateSuggestedFilename = (
  customTitle: string | undefined,
  editor: Editor | null
): string => {
  // First priority: use custom title if provided
  if (customTitle && customTitle.trim() && customTitle !== "Untitled") {
    return (
      customTitle
        .split(/\s+/) // Split into words
        .filter(Boolean)
        .slice(0, 7) // Keep at most 7 words
        .join("-") // Join with hyphens
        .replace(/[^a-zA-Z0-9-]/g, "") // Remove non-alphanumeric (except hyphen)
        .substring(0, 50) || "Untitled"
    ); // Cap to 50 characters, fallback to Untitled
  }

  // Second priority: extract from first line of content
  if (editor) {
    const content = editor.getHTML();
    const firstLineText = content
      .split("\n")[0] // Get first line
      .replace(/<[^>]+>/g, "") // Remove HTML tags
      .trim(); // Remove leading/trailing whitespace

    // Take the first 7 words, sanitise, join with hyphens, and cap length
    const firstLine = firstLineText
      .split(/\s+/) // Split into words
      .filter(Boolean)
      .slice(0, 7) // Keep at most 7 words
      .join("-") // Join with hyphens
      .replace(/[^a-zA-Z0-9-]/g, "") // Remove non-alphanumeric (except hyphen)
      .substring(0, 50); // Cap to 50 characters

    return firstLine || "Untitled";
  }

  return "Untitled";
};

export interface TextEditInitialData {
  path?: string;
  content?: string;
}