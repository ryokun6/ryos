/** Normalize a path to absolute form (leading slash). */
export const normalizePath = (path: string): string =>
  path.startsWith("/") ? path : `/${path}`;

/** Parent directory path; root stays `/`. */
export const getParentPath = (path: string): string => {
  if (path === "/") return "/";
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return "/";
  return `/${parts.slice(0, -1).join("/")}`;
};

/** Join a parent directory and child name into a full path. */
export const joinPath = (parentPath: string, name: string): string => {
  if (parentPath === "/") return `/${name}`;
  return `${parentPath}/${name}`;
};

/** Built-in default files used for timestamp seeding during one-time sync. */
export const DEFAULT_FILE_PATHS = new Set([
  "/Documents/README.md",
  "/Documents/Quick Tips.md",
  "/Images/steve-jobs.png",
  "/Images/susan-kare.png",
]);

/** Map a file extension to a VFS content type string. */
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
      return "jpg";
    case "gif":
    case "webp":
    case "bmp":
      return ext;
    case "html":
    case "htm":
      return "html";
    default:
      return "unknown";
  }
}

export const arePathArraysEqual = (
  first: readonly string[],
  second: readonly string[]
) =>
  first.length === second.length &&
  first.every((path, index) => path === second[index]);
