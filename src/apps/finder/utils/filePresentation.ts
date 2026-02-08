import { type AppId, getAppIconPath } from "@/config/appRegistry";
import { type FileSystemItem, useFilesStore } from "@/stores/useFilesStore";

// Get specific type from extension
export function getFileTypeFromExtension(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "unknown";
  switch (ext) {
    case "app":
      return "application";
    case "md":
      return "markdown";
    case "txt":
      return "text";
    case "png":
      return ext;
    case "jpg":
    case "jpeg":
      return "jpg"; // Standardize to jpg for jpeg/jpg files
    case "gif":
      return ext;
    case "webp":
      return ext;
    case "bmp":
      return ext;
    default:
      return "unknown";
  }
}

// Get icon based on FileSystemItem metadata
export function getFileIcon(item: FileSystemItem): string {
  // Handle aliases/shortcuts first
  if (item.aliasType && item.aliasTarget) {
    if (item.aliasType === "app") {
      // For app aliases, resolve icon from app registry
      try {
        const iconPath = getAppIconPath(item.aliasTarget as AppId);
        if (iconPath) {
          return iconPath;
        }
      } catch (err) {
        console.warn(
          `[getFileIcon] Failed to resolve icon for app alias ${item.aliasTarget}:`,
          err
        );
      }
      return "/icons/default/application.png";
    } else if (item.aliasType === "file") {
      // For file aliases, resolve icon from target file
      const fileStore = useFilesStore.getState();
      const targetFile = fileStore.getItem(item.aliasTarget);
      if (targetFile) {
        // Recursively get icon for target (in case target is also an alias)
        return getFileIcon(targetFile);
      }
      return "/icons/default/file.png";
    }
  }

  // Use stored icon if available (but only if not an alias, since aliases should resolve)
  if (item.icon && item.icon.trim() !== "") {
    return item.icon;
  }

  if (item.isDirectory) {
    // Special handling for Trash icon based on content
    if (item.path === "/Trash") {
      // We need a way to know if trash is empty. We'll use local state for now.
      // This will be updated when trashItems state changes.
      return "/icons/trash-empty.png"; // Placeholder, will be updated by effect
    }
    return "/icons/directory.png";
  }

  switch (item.type) {
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "bmp":
      return "/icons/image.png";
    case "markdown":
    case "text":
      return "/icons/file-text.png";
    case "application": // Should ideally use item.icon from registry
      return item.icon || "/icons/file.png"; // Use item.icon if available
    case "Music":
      return "/icons/sound.png";
    case "Video":
      return "/icons/video-tape.png";
    case "site-link":
      return "/icons/site.png";
    default:
      return "/icons/file.png";
  }
}
