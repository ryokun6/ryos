import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LayoutGroup } from "motion/react";
import { useTranslation } from "react-i18next";
import { Plus, SquaresFour, Rows, Barcode, ShareNetwork } from "@phosphor-icons/react";
import {
  ToolbarButton,
  ToolbarButtonGroup,
} from "@/components/ui/toolbar-button";
import { RightClickMenu, type MenuItem } from "@/components/ui/right-click-menu";
import { useResizeObserverWithRef } from "@/hooks/useResizeObserver";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { StuffItemCover } from "./StuffItemCover";
import type { StuffItem, StuffShelfView, StuffTag } from "../types";

interface StuffShelfViewProps {
  items: StuffItem[];
  tags: StuffTag[];
  selectedItemId: string | null;
  shelfView: StuffShelfView;
  onSetShelfView: (view: StuffShelfView) => void;
  onSelectItem: (id: string) => void;
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

const ITEM_WIDTH = 110;
const ITEM_GAP = 20;
const SHELF_GUTTER = 32;
const SHELF_ROW_HEIGHT = 140 - 6 + 12 + 14 + 16; // 176
const SHELF_TOOLBAR_CLEARANCE = 56;

const WOOD_BG: React.CSSProperties = {
  backgroundColor: "#a8662a",
  backgroundImage:
    "linear-gradient(rgba(255,216,152,0.55), rgba(226,156,88,0.6)), url('/assets/books/wood-shelf.webp')",
  backgroundBlendMode: "soft-light, normal",
  backgroundSize: "auto, 1024px auto",
  backgroundRepeat: "repeat",
};

function ShelfLedge({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <div
      className="relative w-full"
      style={{ filter: isDarkMode ? "brightness(0.85)" : undefined }}
    >
      <div
        className="h-[12px] w-full"
        style={{
          ...WOOD_BG,
          backgroundImage:
            "linear-gradient(to top, rgba(192,146,88,0.6), rgba(58,38,18,0.64)), url('/assets/books/wood-shelf.webp')",
          backgroundBlendMode: "normal, normal",
          backgroundSize: "auto, 1024px auto",
          backgroundRepeat: "repeat",
          clipPath:
            "polygon(28px 0, calc(100% - 28px) 0, 100% 100%, 0 100%)",
          boxShadow: "inset 0 4px 5px -3px rgba(0,0,0,0.6)",
        }}
      />
      <div
        className="h-[14px] w-full rounded-b-[3px]"
        style={{
          ...WOOD_BG,
          backgroundImage:
            "linear-gradient(to bottom, rgba(255,220,170,0.35), rgba(90,50,20,0.55)), url('/assets/books/wood-shelf.webp')",
          backgroundBlendMode: "soft-light, normal",
          boxShadow:
            "0 10px 14px -6px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,230,190,0.35)",
        }}
      />
      <div className="h-[16px]" />
    </div>
  );
}

export function StuffShelfView({
  items,
  tags,
  selectedItemId,
  shelfView,
  onSetShelfView,
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
        disabled: !item.barcode,
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
    <div ref={containerRef} className="relative flex min-h-0 flex-1 flex-col">
      <div
        className="absolute inset-0"
        style={{
          ...WOOD_BG,
          ...(isDarkMode
            ? {
                backgroundImage: `${WOOD_BG.backgroundImage}, linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.3))`,
              }
            : null),
        }}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center pt-2">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-black/35 px-2 py-1 backdrop-blur-sm">
          <ToolbarButtonGroup>
            <ToolbarButton
              icon
              aria-label={t("apps.stuff.toolbar.add", { defaultValue: "Add" })}
              onClick={onAddItem}
            >
              <Plus size={14} weight="bold" />
            </ToolbarButton>
            <ToolbarButton
              icon
              aria-label={t("apps.stuff.toolbar.scan", { defaultValue: "Scan" })}
              onClick={onScan}
            >
              <Barcode size={14} />
            </ToolbarButton>
            <ToolbarButton
              icon
              aria-label={t("apps.stuff.toolbar.share", {
                defaultValue: "Share",
              })}
              onClick={onShare}
            >
              <ShareNetwork size={14} />
            </ToolbarButton>
          </ToolbarButtonGroup>
          <ToolbarButtonGroup>
            <ToolbarButton
              icon
              data-state={shelfView === "grid" ? "on" : "off"}
              aria-label="Grid"
              onClick={() => onSetShelfView("grid")}
            >
              <SquaresFour size={14} />
            </ToolbarButton>
            <ToolbarButton
              icon
              data-state={shelfView === "list" ? "on" : "off"}
              aria-label="List"
              onClick={() => onSetShelfView("list")}
            >
              <Rows size={14} />
            </ToolbarButton>
          </ToolbarButtonGroup>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="relative z-10 min-h-0 flex-1 overflow-y-auto"
        style={{ paddingTop: SHELF_TOOLBAR_CLEARANCE }}
      >
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center text-[#f5e6d0]">
            <p className="font-apple-garamond text-2xl">
              {t("apps.stuff.empty.title", { defaultValue: "No stuff yet" })}
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
            <div className="space-y-2 px-6 pb-8">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-md bg-black/20 px-3 py-2 text-left text-[#f5e6d0] hover:bg-black/30"
                  onClick={() => onSelectItem(item.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ item, x: e.clientX, y: e.clientY });
                  }}
                >
                  <StuffItemCover
                    item={item}
                    tags={tags}
                    size="list"
                    selected={selectedItemId === item.id}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-apple-garamond text-lg">
                      {item.title}
                    </div>
                    <div className="truncate text-xs opacity-75">
                      {[item.brand, item.status.replace(/_/g, " "), item.barcode]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </LayoutGroup>
        ) : (
          <LayoutGroup>
            <div className="pb-8">
              {rows.map((row, rowIndex) => (
                <div key={`row-${rowIndex}`}>
                  <div
                    className="flex items-end justify-start"
                    style={{
                      paddingLeft: SHELF_GUTTER,
                      paddingRight: SHELF_GUTTER,
                      gap: ITEM_GAP,
                      minHeight: 140,
                      marginBottom: -6,
                    }}
                  >
                    {row.map((item) => (
                      <StuffItemCover
                        key={item.id}
                        item={item}
                        tags={tags}
                        selected={selectedItemId === item.id}
                        onClick={() => onSelectItem(item.id)}
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
                  <ShelfLedge isDarkMode={isDarkMode} />
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
