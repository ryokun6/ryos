/**
 * Shared utility functions for importing and exporting applets
 * Used by both AppletViewer and Finder
 */

import { extractMetadataFromHtml, injectMetadataIntoHtml, type AppletMetadata } from "./appletMetadata";
import { extractEmojiIcon } from "@/apps/applet-viewer/utils/appletActions";
import { useFilesStore } from "@/stores/useFilesStore";
import { toast } from "sonner";

export interface ImportedAppletData {
  content: string;
  name: string;
  icon?: string;
  shareId?: string;
  createdBy?: string;
  windowWidth?: number;
  windowHeight?: number;
  createdAt?: number;
  modifiedAt?: number;
}

/**
 * Decompress a gzipped file (for .app and .gz files)
 */
async function decompressGzip(file: File): Promise<string> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("DecompressionStream API not available");
  }

  const arrayBuffer = await file.arrayBuffer();
  const blob = new Blob([arrayBuffer]);
  const stream = blob.stream();
  const decompressionStream = new DecompressionStream("gzip");
  const decompressedStream = stream.pipeThrough(decompressionStream);
  
  const chunks: Uint8Array[] = [];
  const reader = decompressedStream.getReader();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
    }
  }
  
  // Combine chunks and convert to text
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  
  const decoder = new TextDecoder();
  return decoder.decode(combined);
}

/**
 * Import an applet file (.app, .gz, .html, .htm)
 * Handles both JSON format (gzipped) and HTML format (with metadata comments)
 * 
 * @param file - The file to import
 * @param username - Optional username for createdBy field
 * @returns Parsed applet data ready to be saved
 */
export async function importAppletFile(
  file: File,
  username?: string
): Promise<ImportedAppletData> {
  let fileText: string;

  // Check if file is gzipped (.app file or .gz file)
  const fileExtension = file.name.toLowerCase();
  if (fileExtension.endsWith(".app") || fileExtension.endsWith(".gz")) {
    // Try to decompress as gzip
    try {
      fileText = await decompressGzip(file);
    } catch (decompressError) {
      // If decompression fails, treat as plain text
      console.warn("Failed to decompress, treating as plain text:", decompressError);
      fileText = await file.text();
    }
  } else {
    // Not a gzipped file, read as text
    fileText = await file.text();
  }

  let content: string;
  let importFileName: string;
  let icon: string | undefined;
  let shareId: string | undefined;
  let createdBy: string | undefined;
  let windowWidth: number | undefined;
  let windowHeight: number | undefined;
  let createdAt: number | undefined;
  let modifiedAt: number | undefined;

  // Try to parse as JSON (full applet export)
  try {
    const jsonData = JSON.parse(fileText);
    if (jsonData.content && typeof jsonData.content === "string") {
      // Full JSON format
      content = jsonData.content;
      importFileName = jsonData.name || file.name;
      icon = jsonData.icon;
      shareId = jsonData.shareId;
      createdBy = jsonData.createdBy;
      windowWidth = jsonData.windowWidth;
      windowHeight = jsonData.windowHeight;
      createdAt = jsonData.createdAt;
      modifiedAt = jsonData.modifiedAt;
    } else {
      // Not a valid applet JSON, treat as plain HTML
      content = fileText;
      importFileName = file.name;
    }
  } catch {
    // Not JSON, treat as plain HTML/App file
    // Try to extract metadata from HTML comments
    const { metadata, content: extractedContent } = extractMetadataFromHtml(fileText);
    content = extractedContent;
    importFileName = file.name;
    
    // Use metadata from HTML comments if available
    if (metadata.shareId) shareId = metadata.shareId;
    if (metadata.name) importFileName = metadata.name;
    if (metadata.icon) icon = metadata.icon;
    if (metadata.createdBy) createdBy = metadata.createdBy;
    if (metadata.windowWidth !== undefined) windowWidth = metadata.windowWidth;
    if (metadata.windowHeight !== undefined) windowHeight = metadata.windowHeight;
    if (metadata.createdAt !== undefined) createdAt = metadata.createdAt;
    if (metadata.modifiedAt !== undefined) modifiedAt = metadata.modifiedAt;
  }

  // Extract emoji from filename BEFORE processing extension
  const { emoji, remainingText } = extractEmojiIcon(importFileName);

  // Use extracted emoji or JSON icon, or remaining text
  if (!icon && emoji) {
    icon = emoji;
  }
  importFileName = remainingText;

  // Ensure the file has .app extension
  if (importFileName.endsWith(".html") || importFileName.endsWith(".htm") || importFileName.endsWith(".json") || importFileName.endsWith(".gz")) {
    importFileName = importFileName.replace(/\.(html|htm|json|gz)$/i, ".app");
  } else if (!importFileName.endsWith(".app")) {
    importFileName = `${importFileName}.app`;
  }

  return {
    content,
    name: importFileName,
    icon,
    shareId,
    createdBy: createdBy || username,
    windowWidth,
    windowHeight,
    createdAt,
    modifiedAt,
  };
}

/**
 * Export an applet as an HTML file (with metadata comments)
 */
export function exportAppletAsHtml(
  htmlContent: string,
  appletPath: string | null,
  filename?: string
): void {
  // Get base filename without extension
  const baseFilename = filename || (appletPath
    ? appletPath
        .split("/")
        .pop()
        ?.replace(/\.(html|app)$/i, "") || "Untitled"
    : "Untitled");

  // Get file metadata from the filesystem
  const fileStore = useFilesStore.getState();
  const currentFile = appletPath ? fileStore.getItem(appletPath) : null;
  
  // Build metadata object
  const metadata: AppletMetadata = {
    shareId: currentFile?.shareId,
    name: currentFile?.name || baseFilename,
    icon: currentFile?.icon,
    createdBy: currentFile?.createdBy,
    windowWidth: currentFile?.windowWidth,
    windowHeight: currentFile?.windowHeight,
    createdAt: currentFile?.createdAt,
    modifiedAt: currentFile?.modifiedAt,
  };

  // Inject metadata as HTML comments at the top
  const htmlWithMetadata = injectMetadataIntoHtml(htmlContent, metadata);

  const blob = new Blob([htmlWithMetadata], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${baseFilename}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toast.success("HTML exported!", {
    description: `${baseFilename}.html exported successfully.`,
  });
}

