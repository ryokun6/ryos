import { useState } from "react";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { AppSidebarPanel } from "@/components/layout/AppSidebarPanel";
import { CandyBarMenuBar } from "./CandyBarMenuBar";
import { AppProps } from "@/apps/base/types";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { appMetadata } from "..";
import { useCandyBarLogic, type IconPack } from "../hooks/useCandyBarLogic";
import { cn } from "@/lib/utils";
import {
  ArrowsClockwise,
  CaretLeft,
  CaretRight,
  ArrowLeft,
  ArrowRight,
  SidebarSimple,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { SearchInput } from "@/components/ui/search-input";
import { useThemeStore } from "@/stores/useThemeStore";

const Panel = AppSidebarPanel;

function GroupListItem({
  label,
  isSelected,
  onClick,
}: {
  label: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px]",
        isSelected ? "" : "hover:bg-black/5 transition-colors"
      )}
      data-selected={isSelected ? "true" : undefined}
      style={{
        ...(isSelected
          ? {
              background: "var(--os-color-selection-bg)",
              color: "var(--os-color-selection-text)",
              textShadow: "var(--os-color-selection-text-shadow)",
            }
          : {}),
      }}
    >
      <span className="truncate">{label}</span>
    </button>
  );
}

function IconPackRow({
  pack,
  isSelected,
  onClick,
  isMacOSXTheme,
  iconSize,
  t,
}: {
  pack: IconPack;
  isSelected: boolean;
  onClick: () => void;
  isMacOSXTheme: boolean;
  iconSize: number;
  t: (key: string) => string;
}) {
  const previewIcons = pack.previewIcons;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex flex-col gap-0 px-4 py-2.5 text-left transition-colors border-b last:border-b-0",
        isSelected
          ? isMacOSXTheme
            ? "bg-[#3875d7]/10"
            : "bg-black/5"
          : "hover:bg-black/5 border-black/5"
      )}
    >
      <h3 className="text-[12px] font-geneva-12 truncate leading-tight">
        {pack.name}
      </h3>
      <p className="text-[10px] font-geneva-12 text-black/50 truncate leading-tight mt-0.5">
        {pack.author} · {pack.iconCount}{" "}
        {pack.iconCount !== 1
          ? t("apps.candybar.statusBar.icons")
          : t("apps.candybar.statusBar.icon")}
      </p>
      <div className="flex flex-wrap gap-5 px-4 mt-3 mb-2">
        {previewIcons.map((icon) => (
          <img
            key={icon.name}
            src={icon.url}
            alt={icon.name}
            className="object-contain [image-rendering:auto] shrink-0"
            style={{ width: iconSize, height: iconSize }}
            loading="lazy"
          />
        ))}
      </div>
    </button>
  );
}

function PackDetailView({
  pack,
  isMacOSXTheme,
  t,
  iconSize,
}: {
  pack: IconPack;
  isMacOSXTheme: boolean;
  t: (key: string) => string;
  iconSize: number;
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 border-b border-black/10">
          <div className="flex-1 min-w-0">
            <h2 className="text-[13px] font-geneva-12 font-bold truncate">
              {pack.name}
            </h2>
            <p className="text-[11px] font-geneva-12 text-black/50">
              {t("apps.candybar.packDetail.by")} {pack.author}
            </p>
          </div>
          {pack.description && (
            <p className="text-[11px] font-geneva-12 text-black/70 mt-2">
              {pack.description}
            </p>
          )}
        </div>
        <div className="p-4">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-3">
            {pack.previewIcons.map((icon) => (
              <div key={icon.name} className="flex flex-col items-center gap-1">
                <img
                  src={icon.url}
                  alt={icon.name}
                  className={cn(
                    "object-contain [image-rendering:auto]",
                    isMacOSXTheme ? "drop-shadow-sm" : ""
                  )}
                  style={{ width: iconSize, height: iconSize }}
                  loading="lazy"
                />
                <span className="text-[9px] font-geneva-12 text-black truncate w-full text-center">
                  {icon.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function IconPackList({
  packs,
  onSelect,
  isMacOSXTheme,
  iconSize,
  t,
}: {
  packs: IconPack[];
  onSelect: (pack: IconPack) => void;
  isMacOSXTheme: boolean;
  iconSize: number;
  t: (key: string) => string;
}) {
  return (
    <div className="flex flex-col">
      {packs.map((pack) => (
        <IconPackRow
          key={pack.id}
          pack={pack}
          isSelected={false}
          onClick={() => onSelect(pack)}
          isMacOSXTheme={isMacOSXTheme}
          iconSize={iconSize}
          t={t}
        />
      ))}
    </div>
  );
}

export function CandyBarAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
}: AppProps) {
  const {
    t,
    translatedHelpItems,
    isXpTheme,
    isMacOSXTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    selectedCategory,
    setSelectedCategory,
    selectedPack,
    selectPack,
    navigateBack,
    navigateForward,
    canNavigateBack,
    canNavigateForward,
    filteredPacks,
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
    sidebarItems,
    fetchIconPacks,
    clearLibrary,
    addPack,
  } = useCandyBarLogic({
    isWindowOpen: isWindowOpen ?? false,
    isForeground: isForeground ?? false,
    instanceId: instanceId ?? "",
  });

  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);
  const [iconSize, setIconSize] = useState(40);
  const [showCategorySidebar, setShowCategorySidebar] = useState(true);
  const isSystem7Theme = useThemeStore((s) => s.current === "system7");
  const menuBar = (
    <CandyBarMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onRefresh={fetchIconPacks}
      onAddPack={addPack}
      onSyncLibrary={fetchIconPacks}
      onClearLibrary={() => setIsConfirmClearOpen(true)}
    />
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={t("apps.candybar.title")}
        onClose={onClose}
        isForeground={isForeground}
        appId="candybar"
        material={isMacOSXTheme ? "brushedmetal" : "default"}
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <div
          className={cn(
            "flex flex-col h-full w-full relative",
            isMacOSXTheme ? "bg-transparent" : ""
          )}
        >
          {/* Toolbar */}
          {isMacOSXTheme ? (
            <div
              className="flex items-center justify-between py-1.5 gap-2 px-1"
              style={{ background: "transparent" }}
            >
              <div className="flex items-center gap-1.5">
                <div className="metal-inset-btn-group">
                  <button
                    type="button"
                    className="metal-inset-btn metal-inset-icon"
                    onClick={navigateBack}
                    disabled={!canNavigateBack}
                  >
                    <CaretLeft size={14} weight="fill" className="scale-x-150 scale-y-90" />
                  </button>
                  <button
                    type="button"
                    className="metal-inset-btn metal-inset-icon"
                    onClick={navigateForward}
                    disabled={!canNavigateForward}
                  >
                    <CaretRight size={14} weight="fill" className="scale-x-150 scale-y-90" />
                  </button>
                </div>
                <div className="metal-inset-btn-group">
                  <button
                    type="button"
                    className="metal-inset-btn metal-inset-icon"
                    onClick={fetchIconPacks}
                    title={t("apps.candybar.menu.refresh")}
                  >
                    <ArrowsClockwise size={14} weight="bold" />
                  </button>
                </div>
              </div>
              <div className="flex-1" />
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                width="150px"
                ariaLabel={t("apps.candybar.searchPlaceholder")}
              />
            </div>
          ) : (
            <div
              className={cn(
                "flex items-center gap-2 p-1.5",
                isXpTheme
                  ? "border-b border-[#919b9c]"
                  : "bg-gray-100 border-b border-gray-300"
              )}
              style={{
                background: isXpTheme ? "transparent" : undefined,
              }}
            >
              <div className="flex gap-0 items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={navigateBack}
                  disabled={!canNavigateBack}
                  className="h-8 w-8"
                >
                  <ArrowLeft size={14} weight="bold" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={navigateForward}
                  disabled={!canNavigateForward}
                  className="h-8 w-8"
                >
                  <ArrowRight size={14} weight="bold" />
                </Button>
              </div>
              <div className="flex-1" />
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                width="180px"
                ariaLabel={t("apps.candybar.searchPlaceholder")}
              />
            </div>
          )}

          {/* Content area */}
          {isMacOSXTheme ? (
            <div className="flex-1 overflow-hidden flex gap-[5px]">
              {/* Sidebar - Contacts group sidebar style */}
              {showCategorySidebar && (
                <Panel
                  bordered={isMacOSXTheme}
                  className="os-sidebar w-[170px] shrink-0 flex flex-col min-h-0"
                  style={!isMacOSXTheme ? { borderRight: "1px solid rgba(0,0,0,0.08)" } : undefined}
                >
                  <div className={cn("flex-1 overflow-y-auto", isMacOSXTheme && "font-geneva-12")}>
                    {sidebarItems.map((item) => (
                      <GroupListItem
                        key={item.id}
                        label={item.label}
                        isSelected={selectedCategory === item.id}
                        onClick={() => {
                          if (selectedPack) navigateBack();
                          setSelectedCategory(item.id);
                        }}
                      />
                    ))}
                  </div>
                </Panel>
              )}

              {/* Main content */}
              <Panel bordered className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
                {selectedPack ? (
                  <PackDetailView
                    pack={selectedPack}
                    isMacOSXTheme={isMacOSXTheme}
                    t={t}
                    iconSize={iconSize}
                  />
                ) : (
                  <div className="flex-1 relative min-h-0">
                    <div className="absolute inset-0 overflow-y-auto bg-white/90">
                      {isLoading ? (
                        <div className="flex items-center justify-center h-full text-[12px] font-geneva-12 text-black/40">
                          {t("apps.candybar.loading")}
                        </div>
                      ) : error ? (
                        <div className="flex items-center justify-center h-full text-[12px] font-geneva-12 text-red-500">
                          {error}
                        </div>
                      ) : filteredPacks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-[12px] font-geneva-12 text-black/40">
                          <span>{t("apps.candybar.noPacks")}</span>
                        </div>
                      ) : (
                        <IconPackList
                          packs={filteredPacks}
                          onSelect={selectPack}
                          isMacOSXTheme={isMacOSXTheme}
                          iconSize={iconSize}
                          t={t}
                        />
                      )}
                    </div>
                  </div>
                )}
              </Panel>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden flex gap-0">
              {/* Non-metal sidebar - Contacts group sidebar style */}
              {showCategorySidebar && (
                <Panel
                  bordered={false}
                  className="os-sidebar w-[170px] shrink-0 flex flex-col min-h-0"
                  style={{ borderRight: isXpTheme ? "1px solid #919b9c" : "1px solid rgba(0,0,0,0.08)" }}
                >
                  <div className="flex-1 overflow-y-auto">
                    {sidebarItems.map((item) => (
                      <GroupListItem
                        key={item.id}
                        label={item.label}
                        isSelected={selectedCategory === item.id}
                        onClick={() => {
                          if (selectedPack) navigateBack();
                          setSelectedCategory(item.id);
                        }}
                      />
                    ))}
                  </div>
                </Panel>
              )}

              {/* Main content */}
              <div className="flex-1 relative min-h-0 min-w-0">
                {selectedPack ? (
                  <div className="absolute inset-0 flex flex-col min-h-0 bg-white">
                    <PackDetailView
                      pack={selectedPack}
                      isMacOSXTheme={isMacOSXTheme}
                      t={t}
                      iconSize={iconSize}
                    />
                  </div>
                ) : isLoading ? (
                  <div className="absolute inset-0 flex items-center justify-center text-[12px] font-geneva-12 text-black/40">
                    {t("apps.candybar.loading")}
                  </div>
                ) : error ? (
                  <div className="absolute inset-0 flex items-center justify-center text-[12px] font-geneva-12 text-red-500">
                    {error}
                  </div>
                ) : filteredPacks.length === 0 ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-[12px] font-geneva-12 text-black/40">
                    <span>{t("apps.candybar.noPacks")}</span>
                  </div>
                ) : (
                  <div className="absolute inset-0 overflow-y-auto bg-white">
                    <IconPackList
                      packs={filteredPacks}
                      onSelect={selectPack}
                      isMacOSXTheme={isMacOSXTheme}
                      iconSize={iconSize}
                      t={t}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Status bar — padding/height aligned with Calendar bottom toolbar */}
          {isMacOSXTheme ? (
            <div
              className="os-status-bar os-status-bar-text flex items-center gap-2 py-1.5 px-1 text-[10px] font-geneva-12 border-t"
              style={{
                borderColor: "rgba(0,0,0,0.25)",
                background: "transparent",
                textShadow: "0 1px 0 rgba(255,255,255,0.5)",
                color: "#333",
              }}
            >
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="metal-inset-btn-group">
                  <button
                    type="button"
                    className="metal-inset-btn metal-inset-icon"
                    onClick={() => setShowCategorySidebar((v) => !v)}
                    data-state={showCategorySidebar ? "on" : "off"}
                    title={t("apps.candybar.statusBar.toggleSidebar")}
                    aria-label={t("apps.candybar.statusBar.toggleSidebar")}
                  >
                    <SidebarSimple size={14} />
                  </button>
                </div>
                <Slider
                  value={[iconSize]}
                  onValueChange={([v]) => setIconSize(v)}
                  min={16}
                  max={64}
                  step={4}
                  className="w-20"
                />
              </div>
              <div className="flex-1 min-w-0 flex items-center justify-center pointer-events-none">
                {selectedPack
                  ? `${selectedPack.iconCount} ${selectedPack.iconCount !== 1 ? t("apps.candybar.statusBar.icons") : t("apps.candybar.statusBar.icon")}`
                  : `${filteredPacks.length} ${filteredPacks.length !== 1 ? t("apps.candybar.statusBar.packs") : t("apps.candybar.statusBar.pack")}`}
              </div>
            </div>
          ) : (
            <div
              className="os-status-bar os-status-bar-text flex items-center gap-2 py-1.5 px-2 text-[10px] font-geneva-12 border-t"
              style={{
                borderColor: isXpTheme ? "#ACA899" : "rgba(0,0,0,0.1)",
                background: isXpTheme ? "#ECE9D8" : "#e0e0e0",
              }}
            >
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant={isSystem7Theme ? "player" : "ghost"}
                  size="icon"
                  onClick={() => setShowCategorySidebar((v) => !v)}
                  data-state={showCategorySidebar ? "on" : "off"}
                  className={cn("h-6 w-6", isXpTheme && "text-black")}
                  title={t("apps.candybar.statusBar.toggleSidebar")}
                  aria-label={t("apps.candybar.statusBar.toggleSidebar")}
                >
                  <SidebarSimple size={14} />
                </Button>
                <Slider
                  value={[iconSize]}
                  onValueChange={([v]) => setIconSize(v)}
                  min={16}
                  max={64}
                  step={4}
                  className="w-20"
                />
              </div>
              <div className="flex-1 min-w-0 flex items-center justify-center pointer-events-none">
                {selectedPack
                  ? `${selectedPack.iconCount} ${selectedPack.iconCount !== 1 ? t("apps.candybar.statusBar.icons") : t("apps.candybar.statusBar.icon")}`
                  : `${filteredPacks.length} ${filteredPacks.length !== 1 ? t("apps.candybar.statusBar.packs") : t("apps.candybar.statusBar.pack")}`}
              </div>
            </div>
          )}
        </div>
      </WindowFrame>
      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        appId="candybar"
        helpItems={translatedHelpItems}
      />
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={appMetadata}
        appId="candybar"
      />
      <ConfirmDialog
        isOpen={isConfirmClearOpen}
        onOpenChange={setIsConfirmClearOpen}
        onConfirm={() => {
          clearLibrary();
          setIsConfirmClearOpen(false);
        }}
        title={t("apps.candybar.dialogs.clearLibrary.title")}
        description={t("apps.candybar.dialogs.clearLibrary.description")}
      />
    </>
  );
}
