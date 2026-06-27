import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListRowItem } from "./ListRowItem";
import { SelectionMarqueeOverlay } from "./SelectionMarqueeOverlay";
import type { FileListViewModel } from "./useFileList";

export function FileListListView(vm: FileListViewModel) {
  const {
    files,
    isMacOSTheme,
    dropTargetPath,
    selectedFiles,
    containerRef,
    listTableKey,
    selectionMarqueeProps,
    onItemContextMenu,
    handleFileOpen,
    handleFileSelect,
    getFileType,
    getIconPath,
    getDisplayName,
    getListIconAlt,
    shouldShowThumbnail,
    isImageFile,
    containerDragHandlers,
    itemDragHandlers,
    t,
  } = vm;

  const listHeaderTextClass = isMacOSTheme ? "text-[11px]" : "text-[10px]";
  const listBodyTextClass = isMacOSTheme ? "text-[12px]" : "text-[11px]";

  return (
    <div
      ref={containerRef}
      className="relative font-geneva-12"
      {...containerDragHandlers}
    >
      <Table key={listTableKey} className="min-w-[480px] table-fixed">
        <colgroup>
          <col />
          <col className="w-[80px]" />
          <col className="w-[76px]" />
          <col className="w-[112px]" />
        </colgroup>
        <TableHeader>
          <TableRow className={`${listHeaderTextClass} border-none font-normal`}>
            <TableHead className="h-[24px] truncate whitespace-nowrap font-normal">
              {t("apps.finder.tableHeaders.name")}
            </TableHead>
            <TableHead className="h-[24px] truncate whitespace-nowrap font-normal">
              {t("apps.finder.tableHeaders.type")}
            </TableHead>
            <TableHead className="h-[24px] truncate whitespace-nowrap font-normal">
              {t("apps.finder.tableHeaders.size")}
            </TableHead>
            <TableHead className="h-[24px] truncate whitespace-nowrap font-normal">
              {t("apps.finder.tableHeaders.modified")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className={listBodyTextClass}>
          {files.map((file) => (
            <ListRowItem
              key={file.path}
              file={file}
              selectedFiles={selectedFiles}
              dropTargetPath={dropTargetPath}
              onItemContextMenu={onItemContextMenu}
              onFileOpen={handleFileOpen}
              onFileSelect={handleFileSelect}
              getIconPath={getIconPath}
              getDisplayName={getDisplayName}
              getFileType={getFileType}
              getListIconAlt={getListIconAlt}
              shouldShowThumbnail={shouldShowThumbnail}
              isImageFile={isImageFile}
              {...itemDragHandlers}
            />
          ))}
        </TableBody>
      </Table>
      {selectionMarqueeProps ? (
        <SelectionMarqueeOverlay {...selectionMarqueeProps} />
      ) : null}
    </div>
  );
}
