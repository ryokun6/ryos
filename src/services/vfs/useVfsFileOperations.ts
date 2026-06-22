import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";

export function useVfsFileOperations(basePath: string) {
  const { saveFile, moveToTrash } = useFileSystem(basePath, { skipLoad: true });
  return { saveFile, moveToTrash };
}
