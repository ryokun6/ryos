import type {
  RyosDesktopFileFilter,
  RyosDesktopOpenedFile,
  RyosDesktopOpenFileOptions,
} from "@/types/ryos-desktop";

export type NativeFileFilter = RyosDesktopFileFilter;

interface OpenNativeFileOptions extends RyosDesktopOpenFileOptions {
  mimeType?: string;
}

interface SaveNativeFileOptions {
  title?: string;
  defaultPath: string;
  filters?: NativeFileFilter[];
}

function getDesktopApi() {
  return typeof window !== "undefined" ? window.ryosDesktop : undefined;
}

function openedFileToFile(file: RyosDesktopOpenedFile, mimeType?: string): File {
  return new File([file.data], file.name, {
    type: mimeType ?? "",
    lastModified: file.lastModified,
  });
}

export async function openNativeFile(
  options: OpenNativeFileOptions = {}
): Promise<File | null> {
  const api = getDesktopApi();
  if (!api?.openFile) {
    return null;
  }

  const result = await api.openFile(options);
  if (result.canceled || result.files.length === 0) {
    return null;
  }

  return openedFileToFile(result.files[0], options.mimeType);
}

export async function saveBlobWithNativeDialog(
  blob: Blob,
  options: SaveNativeFileOptions
): Promise<boolean> {
  const api = getDesktopApi();
  if (!api?.saveFile) {
    return false;
  }

  const result = await api.saveFile({
    title: options.title,
    defaultPath: options.defaultPath,
    filters: options.filters,
    data: await blob.arrayBuffer(),
  });

  return !result.canceled;
}

export async function saveBlobToDevice(
  blob: Blob,
  filename: string,
  options: Omit<SaveNativeFileOptions, "defaultPath"> = {}
): Promise<void> {
  const saved = await saveBlobWithNativeDialog(blob, {
    ...options,
    defaultPath: filename,
  });

  if (saved) {
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
