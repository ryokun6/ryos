import { useEffect, useRef } from "react";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { AppDrawer } from "@/components/shared/AppDrawer";
import { AppProps } from "@/apps/base/types";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { cn } from "@/lib/utils";
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
import { StuffShareDialog } from "./StuffShareDialog";
import { StuffSharedView } from "./StuffSharedView";
import { printStuffLabels, itemToLabelTarget } from "../utils/printLabels";

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
  const { isMacOSTheme, isWindowsTheme } = useThemeFlags();
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
      onPrintItemLabels={logic.handlePrintItemLabels}
      onPrintTagLabels={() => logic.handlePrintTagLabels()}
      canPrintItems={logic.items.length > 0}
      canPrintTags={logic.tags.length > 0}
      isSharedView={Boolean(viewingShareId)}
      onBackFromShare={() => logic.setActiveShareId(null)}
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
        // Opaque metal like Calendar/Finder — glass/transparent chrome lets the
        // desktop show through content gaps as a frosted "ghost" over the shelf.
        material={isMacOSTheme ? "brushedmetal" : "default"}
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        menuBar={isWindowsTheme ? menuBar : undefined}
        windowConstraints={{ minWidth: 560, minHeight: 400 }}
        drawer={
          <AppDrawer isOpen={showItemDrawer}>
            {logic.selectedItem ? (
              <StuffDetailPanel
                item={logic.selectedItem}
                tags={logic.tags}
                onChange={logic.handleUpdateSelected}
                onDelete={logic.handleDeleteSelected}
                onPrint={logic.handlePrintSelected}
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
          <div
            className={cn(
              "flex size-full flex-col overflow-hidden font-os-ui",
              isMacOSTheme ? "bg-transparent" : "bg-os-window-bg"
            )}
          >
            <div
              className={cn(
                "flex min-h-0 flex-1 overflow-hidden",
                isMacOSTheme && "gap-[5px] p-[5px]"
              )}
            >
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
              <div
                className={cn(
                  "min-h-0 min-w-0 flex-1 overflow-hidden",
                  isMacOSTheme && "bg-white os-inset-pane"
                )}
                style={
                  isMacOSTheme
                    ? {
                        border: "1px solid rgba(0, 0, 0, 0.55)",
                        boxShadow:
                          "inset 0 1px 2px rgba(0, 0, 0, 0.25), 0 1px 0 rgba(255, 255, 255, 0.4)",
                      }
                    : undefined
                }
              >
                <StuffShelfView
                  items={logic.filteredItems}
                  tags={logic.tags}
                  selectedItemId={logic.selectedItemId}
                  shelfView={logic.shelfView}
                  onSetShelfView={logic.setShelfView}
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
    </>
  );
}
