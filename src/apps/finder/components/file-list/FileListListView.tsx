import { useEffect, useMemo, useState } from "react";
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

const LIST_ROW_HEIGHT = 32;
const LIST_HEADER_HEIGHT = 24;
const LIST_OVERSCAN_ROWS = 12;
const LIST_VIRTUALIZATION_THRESHOLD = 120;

export function getVirtualListRange({
  itemCount,
  scrollTop,
  viewportHeight,
  rowHeight = LIST_ROW_HEIGHT,
  headerHeight = LIST_HEADER_HEIGHT,
  overscan = LIST_OVERSCAN_ROWS,
}: {
  itemCount: number;
  scrollTop: number;
  viewportHeight: number;
  rowHeight?: number;
  headerHeight?: number;
  overscan?: number;
}) {
  if (itemCount <= 0) {
    return { start: 0, end: 0, topPadding: 0, bottomPadding: 0 };
  }

  const bodyScrollTop = Math.max(0, scrollTop - headerHeight);
  const firstVisible = Math.floor(bodyScrollTop / rowHeight);
  const visibleCount = Math.ceil(viewportHeight / rowHeight);
  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(itemCount, firstVisible + visibleCount + overscan);

  return {
    start,
    end,
    topPadding: start * rowHeight,
    bottomPadding: Math.max(0, (itemCount - end) * rowHeight),
  };
}

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
  const shouldVirtualize = files.length > LIST_VIRTUALIZATION_THRESHOLD;
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 });

  useEffect(() => {
    if (!shouldVirtualize) return;
    const container = containerRef.current;
    const scrollParent = container?.parentElement;
    if (!scrollParent) return;

    const updateViewport = () => {
      setViewport({
        scrollTop: scrollParent.scrollTop,
        height: scrollParent.clientHeight,
      });
    };

    updateViewport();
    scrollParent.addEventListener("scroll", updateViewport, { passive: true });
    const resizeObserver = new ResizeObserver(updateViewport);
    resizeObserver.observe(scrollParent);

    return () => {
      scrollParent.removeEventListener("scroll", updateViewport);
      resizeObserver.disconnect();
    };
  }, [containerRef, shouldVirtualize]);

  const virtualRange = useMemo(
    () =>
      shouldVirtualize
        ? getVirtualListRange({
            itemCount: files.length,
            scrollTop: viewport.scrollTop,
            viewportHeight: viewport.height,
          })
        : {
            start: 0,
            end: files.length,
            topPadding: 0,
            bottomPadding: 0,
          },
    [files.length, shouldVirtualize, viewport.height, viewport.scrollTop]
  );
  const visibleFiles = shouldVirtualize
    ? files.slice(virtualRange.start, virtualRange.end)
    : files;

  return (
    <div
      ref={containerRef}
      className="relative font-geneva-12"
      {...containerDragHandlers}
    >
      <Table key={listTableKey} className="min-w-[480px] table-fixed">
        <TableHeader>
          <TableRow className={`${listHeaderTextClass} border-none font-normal`}>
            <TableHead className="h-[24px] min-w-0 whitespace-nowrap font-normal">
              {t("apps.finder.tableHeaders.name")}
            </TableHead>
            <TableHead className="h-[24px] w-[136px] min-w-[136px] whitespace-nowrap font-normal">
              {t("apps.finder.tableHeaders.type")}
            </TableHead>
            <TableHead className="h-[24px] w-[72px] min-w-[72px] whitespace-nowrap font-normal">
              {t("apps.finder.tableHeaders.size")}
            </TableHead>
            <TableHead className="h-[24px] w-[104px] min-w-[104px] whitespace-nowrap font-normal">
              {t("apps.finder.tableHeaders.modified")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className={listBodyTextClass}>
          {virtualRange.topPadding > 0 ? (
            <TableRow aria-hidden="true" className="border-none">
              <td colSpan={4} style={{ height: virtualRange.topPadding, padding: 0 }} />
            </TableRow>
          ) : null}
          {visibleFiles.map((file) => (
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
          {virtualRange.bottomPadding > 0 ? (
            <TableRow aria-hidden="true" className="border-none">
              <td colSpan={4} style={{ height: virtualRange.bottomPadding, padding: 0 }} />
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
      {selectionMarqueeProps ? (
        <SelectionMarqueeOverlay {...selectionMarqueeProps} />
      ) : null}
    </div>
  );
}
