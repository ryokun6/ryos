import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LayoutGroup } from "motion/react";
import { useTranslation } from "react-i18next";
import {
  Plus,
  SquaresFour,
  Rows,
  Barcode,
  ShareNetwork,
  SidebarSimple,
} from "@phosphor-icons/react";
import {
  ToolbarButton,
  ToolbarButtonGroup,
} from "@/components/ui/toolbar-button";
import { RightClickMenu, type MenuItem } from "@/components/ui/right-click-menu";
import { useResizeObserverWithRef } from "@/hooks/useResizeObserver";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { ScrollingText } from "@/apps/ipod/components/screen";
import {
  StuffItemCover,
  STUFF_TITLE_SCROLL_START_DELAY_SEC,
} from "./StuffItemCover";
import type { StuffItem, StuffShelfView, StuffTag } from "../types";
import {
  STUFF_SHELF_ITEM_WIDTH,
  STUFF_SHELF_ROW_MIN_HEIGHT,
} from "../utils/stuffCoverSizes";
import { WoodShelfLedge } from "@/components/shelf/WoodShelfLedge";

interface StuffShelfViewProps {
  items: StuffItem[];
  tags: StuffTag[];
  selectedItemId: string | null;
  shelfView: StuffShelfView;
  isSidebarVisible: boolean;
  onSetShelfView: (view: StuffShelfView) => void;
  onToggleSidebar: () => void;
  onSelectItem: (id: string | null) => void;
  onAddItem: () => void;
  onScan: () => void;
  onShare: () => void;
  onDeleteItem: (id: string) => void;
  onPrintItem: (id: string) => void;
}

interface ShelfContextMenu {
  item: StuffItem;
  x: number;
  y: number;
}

function StuffShelfListRow({
  item,
  tags,
  selected,
  onSelect,
  onContextMenu,
}: {
  item: StuffItem;
  tags: StuffTag[];
  selected: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const subtitle = [item.brand, item.status.replace(/_/g, " "), item.barcode]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-md bg-black/20 px-3 py-2 text-left text-[#f5e6d0] hover:bg-black/30"
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <StuffItemCover
        item={item}
        tags={tags}
        size="list"
        selected={selected}
      />
      <div className="min-w-0 flex-1">
        <ScrollingText
          text={item.title}
          align="left"
          fadeEdges
          isPlaying={isHovered}
          resetOnPause
          scrollStartDelaySec={STUFF_TITLE_SCROLL_START_DELAY_SEC}
          className="w-full min-w-0 font-apple-garamond text-lg leading-tight"
        />
        <div className="truncate text-xs opacity-75">{subtitle}</div>
      </div>
    </button>
  );
}

const ITEM_WIDTH = STUFF_SHELF_ITEM_WIDTH;
const ITEM_GAP = 20;
const SHELF_GUTTER = 32;
const SHELF_ROW_HEIGHT = STUFF_SHELF_ROW_MIN_HEIGHT - 6 + 12 + 14 + 16;
/** Space for overlay titlebar (pt-7) + floating toolbar row — matches Books shelf. */
const SHELF_TOOLBAR_CLEARANCE = 56;

export function StuffShelfView({
  items,
  tags,
  selectedItemId,
  shelfView,
  isSidebarVisible,
  onSetShelfView,
  onToggleSidebar,
  onSelectItem,
  onAddItem,
  onScan,
  onShare,
  onDeleteItem,
  onPrintItem,
}: StuffShelfViewProps) {
  const { t } = useTranslation();
  const { isDarkMode } = useThemeFlags();
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contextMenu, setContextMenu] = useState<ShelfContextMenu | null>(null);

  useResizeObserverWithRef(containerRef, (entry) => {
    setWidth(entry.contentRect.width);
  });

  useResizeObserverWithRef(scrollRef, (entry) => {
    setViewportHeight(entry.contentRect.height);
  });

  useLayoutEffect(() => {
    if (containerRef.current) {
      setWidth(containerRef.current.clientWidth);
    }
  }, []);

  const columns = useMemo(() => {
    const usable = Math.max(0, width - SHELF_GUTTER * 2);
    return Math.max(1, Math.floor((usable + ITEM_GAP) / (ITEM_WIDTH + ITEM_GAP)));
  }, [width]);

  const rows = useMemo(() => {
    const chunked: StuffItem[][] = [];
    for (let i = 0; i < items.length; i += columns) {
      chunked.push(items.slice(i, i + columns));
    }
    const minRows = Math.max(
      2,
      Math.ceil(
        Math.max(0, viewportHeight - SHELF_TOOLBAR_CLEARANCE) / SHELF_ROW_HEIGHT
      )
    );
    while (chunked.length < minRows) chunked.push([]);
    return chunked;
  }, [items, columns, viewportHeight]);

  const contextMenuItems = useMemo<MenuItem[]>(() => {
    if (!contextMenu) return [];
    const { item } = contextMenu;
    return [
      {
        type: "item",
        label: t("apps.stuff.contextMenu.edit", { defaultValue: "Edit" }),
        onSelect: () => onSelectItem(item.id),
      },
      {
        type: "item",
        label: t("apps.stuff.contextMenu.printLabel", {
          defaultValue: "Print Label",
        }),
        onSelect: () => onPrintItem(item.id),
      },
      { type: "separator" },
      {
        type: "item",
        label: t("apps.stuff.contextMenu.delete", { defaultValue: "Delete" }),
        onSelect: () => onDeleteItem(item.id),
      },
    ];
  }, [contextMenu, t, onSelectItem, onPrintItem, onDeleteItem]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [contextMenu]);

  return (
    <div ref={containerRef} className="relative flex h-full min-h-0 flex-1 flex-col">
      {/* Transparent floating toolbar — overlays the scroller so wood scrolls
          underneath without a clipped gradient edge. Hits pass through except
          on the controls. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 bg-transparent px-3 pb-2 pt-7">
        <div className="pointer-events-auto">
          <ToolbarButtonGroup>
            <ToolbarButton
              icon
              data-state={isSidebarVisible ? "on" : "off"}
              onClick={onToggleSidebar}
              title={t("apps.stuff.toolbar.toggleSidebar", {
                defaultValue: "Toggle Sidebar",
              })}
              aria-label={t("apps.stuff.toolbar.toggleSidebar", {
                defaultValue: "Toggle Sidebar",
              })}
            >
              <SidebarSimple size={14} />
            </ToolbarButton>
          </ToolbarButtonGroup>
        </div>
        <div className="pointer-events-auto flex items-center gap-1.5">
          <ToolbarButtonGroup>
            <ToolbarButton
              icon
              onClick={onAddItem}
              title={t("apps.stuff.toolbar.add", { defaultValue: "Add" })}
              aria-label={t("apps.stuff.toolbar.add", { defaultValue: "Add" })}
            >
              <Plus size={14} weight="bold" />
            </ToolbarButton>
            <ToolbarButton
              icon
              onClick={onScan}
              title={t("apps.stuff.toolbar.scan", { defaultValue: "Scan" })}
              aria-label={t("apps.stuff.toolbar.scan", { defaultValue: "Scan" })}
            >
              <Barcode size={14} />
            </ToolbarButton>
            <ToolbarButton
              icon
              onClick={onShare}
              title={t("apps.stuff.toolbar.share", { defaultValue: "Share" })}
              aria-label={t("apps.stuff.toolbar.share", {
                defaultValue: "Share",
              })}
            >
              <ShareNetwork size={14} />
            </ToolbarButton>
          </ToolbarButtonGroup>
          <ToolbarButtonGroup>
            <ToolbarButton
              icon
              data-state={shelfView === "grid" ? "on" : "off"}
              onClick={() => onSetShelfView("grid")}
              title={t("apps.stuff.shelf.gridView", { defaultValue: "Grid View" })}
              aria-label={t("apps.stuff.shelf.gridView", {
                defaultValue: "Grid View",
              })}
            >
              <SquaresFour size={14} />
            </ToolbarButton>
            <ToolbarButton
              icon
              data-state={shelfView === "list" ? "on" : "off"}
              onClick={() => onSetShelfView("list")}
              title={t("apps.stuff.shelf.listView", { defaultValue: "List View" })}
              aria-label={t("apps.stuff.shelf.listView", {
                defaultValue: "List View",
              })}
            >
              <Rows size={14} />
            </ToolbarButton>
          </ToolbarButtonGroup>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="relative z-10 min-h-0 flex-1 overflow-y-auto"
      >
        {items.length === 0 ? (
          <div
            className="flex h-full flex-col items-center justify-center px-6 text-center text-[#f5e6d0]"
            style={{ paddingTop: SHELF_TOOLBAR_CLEARANCE + 24 }}
          >
            <p className="font-apple-garamond text-2xl">
              {t("apps.stuff.empty.title", { defaultValue: "No Stuff Yet" })}
            </p>
            <p className="mt-2 max-w-sm text-sm opacity-80">
              {t("apps.stuff.empty.description", {
                defaultValue:
                  "Add an item or scan a barcode to start filling your shelves.",
              })}
            </p>
          </div>
        ) : shelfView === "list" ? (
          <LayoutGroup>
            <div
              className="space-y-2 px-6 pb-8"
              style={{ paddingTop: SHELF_TOOLBAR_CLEARANCE }}
            >
              {items.map((item) => (
                <StuffShelfListRow
                  key={item.id}
                  item={item}
                  tags={tags}
                  selected={selectedItemId === item.id}
                  onSelect={() =>
                    onSelectItem(selectedItemId === item.id ? null : item.id)
                  }
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ item, x: e.clientX, y: e.clientY });
                  }}
                />
              ))}
            </div>
          </LayoutGroup>
        ) : (
          <LayoutGroup>
            <div
              className="pb-8"
              style={{ paddingTop: SHELF_TOOLBAR_CLEARANCE }}
            >
              {rows.map((row, rowIndex) => (
                <div key={`row-${rowIndex}`} className="relative">
                  {/* Items sit in front of the ledge upper face (negative margin
                      overlaps the 12px face, same as Books shelf). */}
                  <div
                    className="relative z-[1] flex items-end justify-start"
                    style={{
                      paddingLeft: SHELF_GUTTER,
                      paddingRight: SHELF_GUTTER,
                      gap: ITEM_GAP,
                      minHeight: STUFF_SHELF_ROW_MIN_HEIGHT,
                      marginBottom: -6,
                    }}
                  >
                    {row.map((item) => (
                      <StuffItemCover
                        key={item.id}
                        item={item}
                        tags={tags}
                        selected={selectedItemId === item.id}
                        onClick={() =>
                          onSelectItem(
                            selectedItemId === item.id ? null : item.id
                          )
                        }
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({
                            item,
                            x: e.clientX,
                            y: e.clientY,
                          });
                        }}
                      />
                    ))}
                  </div>
                  <WoodShelfLedge isDark={isDarkMode} />
                </div>
              ))}
            </div>
          </LayoutGroup>
        )}
      </div>

      {createPortal(
        <RightClickMenu
          items={contextMenuItems}
          position={
            contextMenu ? { x: contextMenu.x, y: contextMenu.y } : null
          }
          onClose={() => setContextMenu(null)}
        />,
        document.body
      )}
    </div>
  );
}
