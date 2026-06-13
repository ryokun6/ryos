import { RightClickMenu } from "@/components/ui/right-click-menu";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import type { DesktopProps } from "./desktopTypes";
import { useDesktop } from "./useDesktop";
import { DesktopIconGrid } from "./DesktopIconGrid";
import { DesktopDragRegion } from "./DesktopDragRegion";

export function Desktop(props: DesktopProps) {
  const d = useDesktop(props);

  return (
    <div
      ref={d.desktopRef}
      className="absolute inset-0 min-h-screen h-full z-[-1] desktop-background"
      onMouseDown={d.handleBlankMouseDown}
      onClick={d.handleDesktopClick}
      onContextMenu={d.desktopContextMenuHandler}
      onDragOver={d.handleDragOver}
      onDragLeave={d.handleDragLeave}
      onDrop={d.handleDrop}
      style={d.finalStyles}
      {...d.longPressHandlers}
    >
      <video
        ref={d.videoRef}
        className="absolute inset-0 w-full h-full object-cover z-[-10]"
        src={d.wallpaperSource}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        data-webkit-playsinline="true"
        style={{
          display: d.isVideoWallpaper ? "block" : "none",
        }}
      />
      <DesktopDragRegion
        isDesktopApp={d.isDesktopApp}
        isXpTheme={d.isXpTheme}
      />
      <DesktopIconGrid
        isXpTheme={d.isXpTheme}
        isMacOSTheme={d.isMacOSTheme}
        isDesktopApp={d.isDesktopApp}
        currentTheme={d.currentTheme}
        macintoshHdName={d.macintoshHdName}
        trashName={d.trashName}
        trashIcon={d.trashIcon}
        desktopShortcuts={d.desktopShortcuts}
        displayedApps={d.displayedApps}
        getDisplayName={d.getDisplayName}
        getShortcutIcon={d.getShortcutIcon}
        isItemSelected={d.isItemSelected}
        onDesktopItemClick={d.handleDesktopItemClick}
        onFinderOpen={d.handleFinderOpen}
        onIconContextMenu={d.handleIconContextMenu}
        onShortcutContextMenu={d.handleShortcutContextMenu}
        onShortcutPointerDown={d.handlePrefetchShortcut}
        onShortcutDoubleClick={d.handleShortcutDoubleClick}
        onAppDoubleClick={d.handleAppDoubleClick}
        onTrashDoubleClick={d.handleTrashDoubleClick}
      />
      {d.isMarqueeSelecting ? (
        // Geometry is painted directly onto this element per pointer move
        // (see useDesktop) so the marquee never re-renders the desktop tree.
        <div
          ref={d.marqueeElementRef}
          className="pointer-events-none absolute z-[2] border"
          style={{
            left: 0,
            top: 0,
            width: 0,
            height: 0,
            borderColor: "rgba(128, 128, 128, 0.6)",
            backgroundColor: "rgba(128, 128, 128, 0.15)",
          }}
        />
      ) : null}
      <RightClickMenu
        position={d.contextMenuPos}
        onClose={d.closeContextMenu}
        items={d.getContextMenuItems()}
      />
      <ConfirmDialog
        isOpen={d.isEmptyTrashDialogOpen}
        onOpenChange={d.setIsEmptyTrashDialogOpen}
        onConfirm={d.confirmEmptyTrash}
        title={d.t("apps.finder.dialogs.emptyTrash.title")}
        description={d.t("apps.finder.dialogs.emptyTrash.description")}
      />
    </div>
  );
}
