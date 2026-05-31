import type { FileItem } from "./types";

export function isImageFile(file: FileItem): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext || "")) {
    return true;
  }

  if (
    file.type?.startsWith("image") ||
    file.type === "png" ||
    file.type === "jpg" ||
    file.type === "jpeg" ||
    file.type === "gif" ||
    file.type === "webp" ||
    file.type === "bmp"
  ) {
    return true;
  }

  return false;
}

export function isMusicFile(file: FileItem): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (["mp3", "m4a", "wav", "aac", "flac", "ogg"].includes(ext || "")) {
    return true;
  }

  if (file.type === "Music") {
    return true;
  }

  return false;
}

export function shouldShowThumbnail(file: FileItem): boolean {
  return isImageFile(file) || (isMusicFile(file) && !!file.contentUrl);
}

export function getIconPath(file: FileItem): string {
  if (file.icon) return file.icon;
  if (file.isDirectory) return "/icons/directory.png";
  if (file.name.endsWith(".txt") || file.name.endsWith(".md"))
    return "/icons/file-text.png";
  return "/icons/file.png";
}
