import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";

export function useVfsFileOperations(basePath: string) {
  const { saveFile } = useFileSystem(basePath, { skipLoad: true });
  return { saveFile };
}
