import { GridItem } from "./GridItem";
import { SelectionMarqueeOverlay } from "./SelectionMarqueeOverlay";
import type { FileListViewModel } from "./useFileList";

export function FileListGridView(vm: FileListViewModel) {
  const {
    files,
    viewType,
    dropTargetPath,
    selectedFiles,
    containerRef,
    selectionMarqueeProps,
    onItemContextMenu,
    handleFileOpen,
    handleFileSelect,
    getDisplayName,
    shouldShowThumbnail,
    isImageFile,
    containerDragHandlers,
    itemDragHandlers,
  } = vm;

  return (
    <div
      ref={containerRef}
      className={`grid ${
        viewType === "large"
          ? "grid-cols-[repeat(auto-fit,minmax(96px,1fr))]"
          : "grid-cols-[repeat(auto-fit,minmax(80px,1fr))]"
      } gap-x-3 gap-y-3 p-3 min-h-[150px] ${
        files.length <= 1 ? "justify-items-start" : "justify-items-center"
      } relative`}
      {...containerDragHandlers}
    >
      {files.map((file) => (
        <GridItem
          key={file.path}
          file={file}
          selectedFiles={selectedFiles}
          dropTargetPath={dropTargetPath}
          viewType={viewType}
          onItemContextMenu={onItemContextMenu}
          onFileOpen={handleFileOpen}
          onFileSelect={handleFileSelect}
          getDisplayName={getDisplayName}
          shouldShowThumbnail={shouldShowThumbnail}
          isImageFile={isImageFile}
          {...itemDragHandlers}
        />
      ))}
      {selectionMarqueeProps ? (
        <SelectionMarqueeOverlay {...selectionMarqueeProps} />
      ) : null}
    </div>
  );
}
