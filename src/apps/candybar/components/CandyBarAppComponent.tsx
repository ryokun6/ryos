import { useState, type CSSProperties, type ReactNode } from "react";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { CandyBarMenuBar } from "./CandyBarMenuBar";
import { AppProps } from "@/apps/base/types";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { appMetadata } from "..";
import { useCandyBarLogic, type IconPack } from "../hooks/useCandyBarLogic";
import { cn } from "@/lib/utils";
import {
  MagnifyingGlass,
  XCircle,
  ArrowsClockwise,
  CaretLeft,
  CaretRight,
  ArrowLeft,
  ArrowRight,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

/* Contacts-style Panel, PanelHeader, GroupListItem - exact styles from ContactsAppComponent */
function Panel({
  className,
  children,
  bordered = true,
  style,
}: {
  className?: string;
  children: ReactNode;
  bordered?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden calendar-sidebar",
        bordered ? "bg-white/90" : "bg-white",
        className
      )}
      style={{
        ...(bordered
          ? {
              border: "1px solid rgba(0, 0, 0, 0.55)",
              boxShadow:
                "inset 0 1px 2px rgba(0, 0, 0, 0.25), 0 1px 0 rgba(255, 255, 255, 0.4)",
            }
          : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function PanelHeader({
  title,
  useGeneva = false,
  bordered = false,
}: {
  title: string;
  useGeneva?: boolean;
  bordered?: boolean;
}) {
  return (
    <div
      className={cn(
        bordered
          ? "relative text-[11px] font-regular text-left pl-3 pr-2 pt-1.5 pb-1"
          : "relative text-[9px] font-bold uppercase tracking-wide opacity-50 text-left pl-3 pr-2 pt-2 pb-1",
        useGeneva && "font-geneva-12"
      )}
      style={
        bordered
          ? {
              background: "linear-gradient(to bottom, #e6e5e5, #aeadad)",
              color: "#222",
              textShadow: "0 1px 0 #e1e1e1",
              borderTop: "1px solid rgba(255,255,255,0.5)",
              borderBottom: "1px solid #787878",
            }
          : { color: "rgba(0,0,0,0.5)" }
      }
    >
      <span>{title}</span>
    </div>
  );
}

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
        "w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px]",
        isSelected ? "" : "hover:bg-black/5 transition-colors"
      )}
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

function MetalPanel({
  className,
  children,
  bordered = true,
  style,
}: {
  className?: string;
  children: ReactNode;
  bordered?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden calendar-sidebar",
        bordered ? "bg-white/90" : "bg-white",
        className
      )}
      style={{
        ...(bordered
          ? {
              border: "1px solid rgba(0, 0, 0, 0.55)",
              boxShadow:
                "inset 0 1px 2px rgba(0, 0, 0, 0.25), 0 1px 0 rgba(255, 255, 255, 0.4)",
            }
          : {}),
        ...style,
      }}
    >
      {children}
    </div>
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
    <div className="flex flex-col h-full">
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
      <div className="flex-1 overflow-y-auto p-4">
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
              <div className="relative w-[150px]">
                <MagnifyingGlass
                  size={13}
                  weight="bold"
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-black/45"
                />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-full border border-black/40 bg-white pl-7 pr-7 py-[3px] text-[11px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.3),inset_0_0_1px_rgba(0,0,0,0.15),0_1px_0_rgba(255,255,255,0.45)] outline-none font-geneva-12"
                  placeholder={t("apps.candybar.searchPlaceholder")}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setSearchQuery("")}
                    className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center justify-center text-black/40 hover:text-black/60"
                  >
                    <XCircle size={14} weight="fill" />
                  </button>
                )}
              </div>
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
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-[180px] rounded border border-black/20 bg-white px-2 py-[2px] text-[11px] outline-none font-geneva-12"
                placeholder={t("apps.candybar.searchPlaceholder")}
              />
            </div>
          )}

          {/* Content area */}
          {isMacOSXTheme ? (
            <div className="flex-1 overflow-hidden flex gap-[5px]">
              {/* Sidebar - Contacts group sidebar style */}
              <Panel
                bordered={isMacOSXTheme}
                className="w-[170px] shrink-0 flex flex-col min-h-0"
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

              {/* Main content */}
              <MetalPanel bordered className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
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
                        <div className="flex flex-col items-center justify-center h-full text-[12px] font-geneva-12 text-black/40 gap-1">
                          <span className="text-[24px]">🍬</span>
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
              </MetalPanel>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden flex gap-0">
              {/* Non-metal sidebar - Contacts group sidebar style */}
              <Panel
                bordered={false}
                className="w-[170px] shrink-0 flex flex-col min-h-0"
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

              {/* Main content */}
              <div className="flex-1 relative min-h-0 min-w-0">
                {selectedPack ? (
                  <div className="absolute inset-0 overflow-y-auto bg-white">
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
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-[12px] font-geneva-12 text-black/40 gap-1">
                    <span className="text-[24px]">🍬</span>
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

          {/* Status bar */}
          {isMacOSXTheme ? (
            <div
              className="os-status-bar os-status-bar-text relative flex items-center px-2 pt-1 pb-0 text-[10px] font-geneva-12 bg-transparent border-t border-black/10"
              style={{
                textShadow: "0 1px 0 rgba(255,255,255,0.5)",
                color: "#333",
              }}
            >
              <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center shrink-0">
                <Slider
                  value={[iconSize]}
                  onValueChange={([v]) => setIconSize(v)}
                  min={16}
                  max={64}
                  step={4}
                  className="w-20"
                />
              </div>
              <div className="flex-1 flex items-center justify-center pointer-events-none">
                {selectedPack
                  ? `${selectedPack.iconCount} ${selectedPack.iconCount !== 1 ? t("apps.candybar.statusBar.icons") : t("apps.candybar.statusBar.icon")}`
                  : `${filteredPacks.length} ${filteredPacks.length !== 1 ? t("apps.candybar.statusBar.packs") : t("apps.candybar.statusBar.pack")}`}
              </div>
            </div>
          ) : (
            <div className="os-status-bar os-status-bar-text relative flex items-center px-2 py-1 text-[10px] font-geneva-12 bg-gray-100 border-t border-gray-300">
              <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center shrink-0">
                <Slider
                  value={[iconSize]}
                  onValueChange={([v]) => setIconSize(v)}
                  min={16}
                  max={64}
                  step={4}
                  className="w-20"
                />
              </div>
              <div className="flex-1 flex items-center justify-center pointer-events-none">
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
