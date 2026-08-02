import { useEffect, useRef } from "react";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { AppDrawer } from "@/components/shared/AppDrawer";
import { AppProps } from "@/apps/base/types";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useSound, Sounds } from "@/hooks/useSound";
import { appMetadata } from "..";
import type { StuffInitialData } from "../types";
import { useStuffLogic } from "../hooks/useStuffLogic";
import { StuffMenuBar } from "./StuffMenuBar";
import { StuffSidebar } from "./StuffSidebar";
import { StuffShelfView } from "./StuffShelfView";
import { StuffDetailPanel } from "./StuffDetailPanel";
import { StuffBarcodeScanner } from "./StuffBarcodeScanner";
import { StuffProductLookupDialog } from "./StuffProductLookupDialog";
import { StuffShareDialog } from "./StuffShareDialog";
import { StuffSharedView } from "./StuffSharedView";
import { printStuffLabels, itemToLabelTarget } from "../utils/printLabels";
import {
  WOOD_SHELF_BG,
  WOOD_SHELF_DARK_SCRIM,
} from "@/components/shelf/woodShelfBackground";

export function StuffAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
  initialData,
}: AppProps<StuffInitialData>) {
  const logic = useStuffLogic({
    isWindowOpen,
    isForeground,
    instanceId,
    initialData,
  });
  const { isWindowsTheme, isDarkMode } = useThemeFlags();
  const viewingShareId = logic.activeShareId;
  const showItemDrawer = Boolean(logic.selectedItem) && !viewingShareId;

  const { play: playDrawerOpen } = useSound(Sounds.WINDOW_ZOOM_MAXIMIZE);
  const { play: playDrawerClose } = useSound(Sounds.WINDOW_ZOOM_MINIMIZE);
  const drawerSoundMountedRef = useRef(false);
  useEffect(() => {
    if (!drawerSoundMountedRef.current) {
      drawerSoundMountedRef.current = true;
      return;
    }
    if (showItemDrawer) void playDrawerOpen();
    else void playDrawerClose();
  }, [showItemDrawer, playDrawerOpen, playDrawerClose]);

  const menuBar = (
    <StuffMenuBar
      onClose={onClose}
      onShowHelp={() => logic.setIsHelpDialogOpen(true)}
      onShowAbout={() => logic.setIsAboutDialogOpen(true)}
      onAddItem={logic.handleAddItem}
      onScan={() => logic.setIsScannerOpen(true)}
      onShare={() => logic.setIsShareDialogOpen(true)}
      onClearShelf={logic.handleClearShelf}
      onPrintItemLabels={logic.handlePrintItemLabels}
      onPrintTagLabels={() => logic.handlePrintTagLabels()}
      onExportShelf={() => void logic.handleExportShelf()}
      onImportShelf={() => void logic.handleImportShelf()}
      canPrintItems={logic.items.length > 0}
      canPrintTags={logic.tags.length > 0}
      canExportShelf={logic.items.length > 0 || logic.tags.length > 0}
      isSharedView={Boolean(viewingShareId)}
      onBackFromShare={() => logic.setActiveShareId(null)}
      shelfView={logic.shelfView}
      onSetShelfView={logic.setShelfView}
      isSidebarVisible={logic.isSidebarVisible}
      onToggleSidebar={logic.toggleSidebarVisibility}
    />
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isWindowsTheme && isForeground && menuBar}
      <WindowFrame
        title={logic.t("apps.stuff.title", { defaultValue: "Stuff" })}
        onClose={onClose}
        isForeground={isForeground}
        appId="stuff"
        material="notitlebar"
        disableTitlebarAutoHide
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        menuBar={isWindowsTheme ? menuBar : undefined}
        windowConstraints={{ minWidth: 560, minHeight: 400 }}
        drawer={
          <AppDrawer isOpen={showItemDrawer} material="wood">
            {logic.selectedItem ? (
              <StuffDetailPanel
                item={logic.selectedItem}
                tags={logic.tags}
                onChange={logic.handleUpdateSelected}
                onDelete={logic.handleDeleteSelected}
                onPrint={logic.handlePrintSelected}
                onLookup={(fields) => void logic.handleLookupFromFields(fields)}
                isLookingUp={logic.isLookingUp}
              />
            ) : null}
          </AppDrawer>
        }
      >
        {viewingShareId ? (
          <StuffSharedView
            shareId={viewingShareId}
            onBack={() => logic.setActiveShareId(null)}
          />
        ) : (
          <div className="stuff-app-shell relative flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden bg-transparent font-os-ui">
            {/* Full-bleed wood shelf backdrop (Books shelf pattern). */}
            <div
              className="absolute inset-0"
              style={WOOD_SHELF_BG}
              aria-hidden
            />
            {isDarkMode && (
              <div
                className="pointer-events-none absolute inset-0 z-0"
                style={{ backgroundColor: WOOD_SHELF_DARK_SCRIM }}
                aria-hidden
              />
            )}
            <div className="relative z-[1] flex min-h-0 w-full flex-1 overflow-hidden">
              {logic.isSidebarVisible ? (
                <StuffSidebar
                  tags={logic.tags}
                  selectedTagId={logic.selectedTagId}
                  statusFilter={logic.statusFilter}
                  itemCountsByTag={logic.itemCountsByTag}
                  totalCount={logic.items.length}
                  searchQuery={logic.searchQuery}
                  onSearchQueryChange={logic.setSearchQuery}
                  onSelectTag={logic.setSelectedTagId}
                  onStatusFilter={logic.setStatusFilter}
                  onAddTag={logic.addTag}
                  onDeleteTag={logic.deleteTag}
                  onPrintTag={(id) => logic.handlePrintTagLabels([id])}
                />
              ) : null}
              <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                <StuffShelfView
                  items={logic.filteredItems}
                  tags={logic.tags}
                  selectedItemId={logic.selectedItemId}
                  shelfView={logic.shelfView}
                  isSidebarVisible={logic.isSidebarVisible}
                  onSetShelfView={logic.setShelfView}
                  onToggleSidebar={logic.toggleSidebarVisibility}
                  onSelectItem={logic.setSelectedItemId}
                  onAddItem={logic.handleAddItem}
                  onScan={() => logic.setIsScannerOpen(true)}
                  onShare={() => logic.setIsShareDialogOpen(true)}
                  onDeleteItem={(id) => logic.deleteItem(id)}
                  onPrintItem={(id) => {
                    const item = logic.items.find((entry) => entry.id === id);
                    if (item) void printStuffLabels([itemToLabelTarget(item)]);
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </WindowFrame>

      <StuffBarcodeScanner
        isOpen={logic.isScannerOpen}
        onClose={() => logic.setIsScannerOpen(false)}
        onScan={(result) => {
          void logic.handleScan(result);
        }}
      />

      <StuffShareDialog
        isOpen={logic.isShareDialogOpen}
        onClose={() => logic.setIsShareDialogOpen(false)}
        items={logic.items}
        tags={logic.tags}
        lastShareId={logic.lastShareId}
        onShareCreated={logic.setLastShareId}
      />

      <StuffProductLookupDialog
        isOpen={Boolean(logic.productLookupPicker)}
        onOpenChange={(open) => {
          if (!open && !logic.isApplyingLookupPick) {
            logic.setProductLookupPicker(null);
          }
        }}
        query={logic.productLookupPicker?.query ?? ""}
        results={logic.productLookupPicker?.results ?? []}
        isApplying={logic.isApplyingLookupPick}
        onSelect={(result) => {
          void logic.handleProductLookupPick(result);
        }}
      />

      <HelpDialog
        isOpen={logic.isHelpDialogOpen}
        onOpenChange={logic.setIsHelpDialogOpen}
        appId="stuff"
        helpItems={logic.translatedHelpItems}
      />
      <AboutDialog
        isOpen={logic.isAboutDialogOpen}
        onOpenChange={logic.setIsAboutDialogOpen}
        metadata={appMetadata}
        appId="stuff"
      />
      <ConfirmDialog
        isOpen={logic.isConfirmClearOpen}
        onOpenChange={logic.setIsConfirmClearOpen}
        onConfirm={logic.confirmClearShelf}
        title={logic.t("apps.stuff.dialogs.clearShelfTitle", {
          defaultValue: "Clear Shelf",
        })}
        description={logic.t("apps.stuff.dialogs.clearShelfDescription", {
          defaultValue:
            "Are you sure you want to clear your entire shelf? All items will be removed and only default tags will remain. This action can't be undone.",
        })}
      />
    </>
  );
}
