import type { AppId } from "@/config/appRegistryData";

export type PreviewKind =
  | "image"
  | "pdf"
  | "html"
  | "markdown"
  | "text"
  | "unsupported";

export interface FileAssociationInput {
  path: string;
  name?: string;
  type?: string;
  isDirectory?: boolean;
}

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
]);
const PAINT_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
]);
const TEXTEDIT_EXTENSIONS = new Set(["txt", "md"]);
const PREVIEW_TEXT_EXTENSIONS = new Set(["json", "csv", "xml"]);
const HTML_EXTENSIONS = new Set(["html", "htm"]);

export const PREVIEW_FILE_ACCEPT =
  ".png,.jpg,.jpeg,.gif,.webp,.bmp,.svg,.pdf,.html,.htm,.txt,.md,.json,.csv,.xml,image/*,application/pdf,text/*";

export function getFileExtension(value: string): string {
  const fileName = value.split("?")[0]?.split("/").pop() ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex + 1).toLowerCase() : "";
}

function getAssociationExtension(file: FileAssociationInput): string {
  return getFileExtension(file.name || file.path);
}

export function resolvePreviewKind(
  path: string,
  content?: string | Blob | ArrayBuffer,
): PreviewKind {
  const extension = getFileExtension(path);

  if (
    IMAGE_EXTENSIONS.has(extension) ||
    (content instanceof Blob && content.type.startsWith("image/"))
  ) {
    return "image";
  }
  if (
    extension === "pdf" ||
    (content instanceof Blob && content.type === "application/pdf")
  ) {
    return "pdf";
  }
  if (
    HTML_EXTENSIONS.has(extension) ||
    (content instanceof Blob && content.type === "text/html")
  ) {
    return "html";
  }
  if (extension === "md" || extension === "markdown") {
    return "markdown";
  }
  if (
    TEXTEDIT_EXTENSIONS.has(extension) ||
    PREVIEW_TEXT_EXTENSIONS.has(extension) ||
    typeof content === "string" ||
    (content instanceof Blob && content.type.startsWith("text/"))
  ) {
    return "text";
  }
  return "unsupported";
}

export function getDefaultFileApp(
  file: FileAssociationInput,
): AppId | null {
  if (file.isDirectory) return null;

  const extension = getAssociationExtension(file);
  const normalizedType = file.type?.toLowerCase() ?? "";

  if (extension === "epub" || normalizedType === "application/epub+zip") {
    return "books";
  }
  if (extension === "app") {
    return "applet-viewer";
  }
  if (
    file.path.startsWith("/Applets/") &&
    (HTML_EXTENSIONS.has(extension) || normalizedType === "html")
  ) {
    return "applet-viewer";
  }
  if (
    TEXTEDIT_EXTENSIONS.has(extension) ||
    normalizedType === "text" ||
    normalizedType === "markdown" ||
    normalizedType === "text/plain" ||
    normalizedType === "text/markdown"
  ) {
    return "textedit";
  }
  if (
    IMAGE_EXTENSIONS.has(extension) ||
    normalizedType.startsWith("image/") ||
    ["image", "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(
      normalizedType,
    )
  ) {
    return "preview";
  }
  if (
    extension === "pdf" ||
    HTML_EXTENSIONS.has(extension) ||
    PREVIEW_TEXT_EXTENSIONS.has(extension) ||
    normalizedType === "application/pdf"
  ) {
    return "preview";
  }
  if (file.path.startsWith("/Images/")) return "preview";
  if (file.path.startsWith("/Books/")) return "books";
  if (file.path.startsWith("/Applets/")) return "applet-viewer";
  if (
    file.path.startsWith("/Documents/") ||
    file.path.startsWith("/Downloads/")
  ) {
    return "preview";
  }

  return null;
}

export function getOpenWithApps(file: FileAssociationInput): AppId[] {
  if (file.isDirectory) return [];

  const extension = getAssociationExtension(file);
  const defaultApp = getDefaultFileApp(file);
  let apps: AppId[];

  if (extension === "epub") {
    apps = ["books"];
  } else if (extension === "app") {
    apps = ["applet-viewer"];
  } else if (
    IMAGE_EXTENSIONS.has(extension) ||
    file.path.startsWith("/Images/")
  ) {
    apps = PAINT_EXTENSIONS.has(extension)
      ? ["preview", "paint"]
      : ["preview"];
  } else if (
    TEXTEDIT_EXTENSIONS.has(extension) ||
    file.type?.toLowerCase() === "text/plain" ||
    file.type?.toLowerCase() === "text/markdown"
  ) {
    apps = ["textedit", "preview"];
  } else if (HTML_EXTENSIONS.has(extension)) {
    apps = ["preview", "textedit", "applet-viewer"];
  } else if (
    extension === "pdf" ||
    file.type?.toLowerCase() === "application/pdf"
  ) {
    apps = ["preview"];
  } else if (
    PREVIEW_TEXT_EXTENSIONS.has(extension) ||
    file.path.startsWith("/Documents/") ||
    file.path.startsWith("/Downloads/")
  ) {
    apps = ["preview", "textedit"];
  } else {
    apps = defaultApp ? [defaultApp] : [];
  }

  if (!defaultApp) return apps;
  return [defaultApp, ...apps.filter((appId) => appId !== defaultApp)];
}
