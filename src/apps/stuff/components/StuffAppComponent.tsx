import { WindowFrame } from "@/components/layout/WindowFrame";
import { AppProps } from "@/apps/base/types";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { Input } from "@/components/ui/input";
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

  const viewingShareId = logic.activeShareId;

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
      {!logic.isWindowsTheme && isForeground && menuBar}
      <WindowFrame
        title={logic.t("apps.stuff.title", { defaultValue: "Stuff" })}
        onClose={onClose}
        isForeground={isForeground}
        appId="stuff"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        menuBar={logic.isWindowsTheme ? menuBar : undefined}
      >
        {viewingShareId ? (
          <StuffSharedView
            shareId={viewingShareId}
            onBack={() => logic.setActiveShareId(null)}
          />
        ) : (
          <div className="flex h-full flex-col bg-os-window-bg font-os-ui">
            <div className="flex items-center gap-2 border-b border-black/10 px-3 py-1.5 dark:border-white/10">
              <Input
                className="h-7 text-sm"
                value={logic.searchQuery}
                onChange={(e) => logic.setSearchQuery(e.target.value)}
                placeholder={logic.t("apps.stuff.searchPlaceholder", {
                  defaultValue: "Search stuff…",
                })}
              />
            </div>
            <div className="flex min-h-0 flex-1">
              <StuffSidebar
                tags={logic.tags}
                selectedTagId={logic.selectedTagId}
                statusFilter={logic.statusFilter}
                itemCountsByTag={logic.itemCountsByTag}
                totalCount={logic.items.length}
                onSelectTag={logic.setSelectedTagId}
                onStatusFilter={logic.setStatusFilter}
                onAddTag={logic.addTag}
                onDeleteTag={logic.deleteTag}
                onPrintTag={(id) => logic.handlePrintTagLabels([id])}
              />
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
              {logic.selectedItem && (
                <StuffDetailPanel
                  item={logic.selectedItem}
                  tags={logic.tags}
                  onClose={() => logic.setSelectedItemId(null)}
                  onChange={logic.handleUpdateSelected}
                  onDelete={logic.handleDeleteSelected}
                  onPrint={logic.handlePrintSelected}
                />
              )}
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
