import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";

export type SaveVfsFileInput = Parameters<
  ReturnType<typeof useFileSystem>["saveFile"]
>[0];

export function useVfsFileOperations(basePath: string) {
  const { saveFile } = useFileSystem(basePath);
  return { saveFile };
}
