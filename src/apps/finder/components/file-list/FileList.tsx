import { FileListGridView } from "./FileListGridView";
import { FileListListView } from "./FileListListView";
import type { FileListProps } from "./types";
import { useFileList } from "./useFileList";

export type { FileItem, FileListProps } from "./types";

export function FileList(props: FileListProps) {
  const vm = useFileList(props);

  if (vm.viewType === "list") {
    return <FileListListView {...vm} />;
  }

  return <FileListGridView {...vm} />;
}
