import type { FileSystemItem } from "@/stores/useFilesStore";

type SaveFileInput = {
  name: string;
  path: string;
  content: string | Blob;
  type?: string;
  icon?: string;
  shareId?: string;
  createdBy?: string;
};

export type SaveFileHandler = (file: SaveFileInput) => Promise<void>;

export async function persistChatDocument(options: {
  saveFile: SaveFileHandler;
  path: string;
  fileName: string;
  content: string;
  icon?: string;
}): Promise<void> {
  const { saveFile, path, fileName, content, icon = "📄" } = options;

  await saveFile({
    name: fileName,
    path,
    content,
    type: "markdown",
    icon,
  });
}

export async function persistChatApplet(options: {
  saveFile: SaveFileHandler;
  fileItem: Pick<FileSystemItem, "path" | "name" | "icon" | "shareId" | "createdBy">;
  content: string;
}): Promise<void> {
  const { saveFile, fileItem, content } = options;

  await saveFile({
    name: fileItem.name,
    path: fileItem.path,
    content,
    type: "html",
    ...(fileItem.icon ? { icon: fileItem.icon } : {}),
    ...(fileItem.shareId ? { shareId: fileItem.shareId } : {}),
    ...(fileItem.createdBy ? { createdBy: fileItem.createdBy } : {}),
  });
}
