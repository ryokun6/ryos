import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { CaretDown, Check } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useSound, Sounds } from "@/hooks/useSound";
import { SearchInput } from "@/components/ui/search-input";

export type ComboboxOption = {
  value: string;
  label: string;
  description?: string;
  category?: string;
  /** Lowercase haystack for filtering; defaults to value + label + description. */
  searchText?: string;
};

export type ComboboxFilter = {
  value: string;
  label: string;
};

export type ComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  /** Label shown on the closed trigger; defaults to the selected option's label. */
  displayValue?: string;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  emptyMessage?: string;
  className?: string;
  /** Minimum dropdown width in px (also at least the trigger width). Default 240. */
  minPanelWidth?: number;
  /** Max height of the scrollable option list in px. Default 240. */
  maxListHeight?: number;
  disabled?: boolean;
  filters?: ComboboxFilter[];
  filterValue?: string;
  onFilterChange?: (value: string) => void;
};

function optionSearchHaystack(option: ComboboxOption): string {
  if (option.searchText != null) return option.searchText;
  return `${option.value} ${option.label} ${option.description ?? ""}`.toLowerCase();
}

const VIEWPORT_MARGIN = 8;
const PANEL_GAP = 4;

type PanelRect = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

// Position the dropdown next to the trigger, flipping above and shifting
// horizontally as needed so it always stays within the viewport ("pop wherever
// there is space"). When a rendered panel is supplied its measured height is
// used to decide whether to flip; otherwise we fall back to an estimate.
function computePanelRect(
  trigger: HTMLButtonElement | null,
  panel: HTMLDivElement | null,
  minPanelWidth: number,
  estimatedHeight: number
): PanelRect | null {
  if (!trigger) return null;
  const r = trigger.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const width = Math.min(
    Math.max(r.width, minPanelWidth),
    Math.max(viewportWidth - VIEWPORT_MARGIN * 2, 0)
  );

  // Horizontal: align to the trigger's left edge, then clamp into view.
  let left = r.left;
  if (left + width > viewportWidth - VIEWPORT_MARGIN) {
    left = viewportWidth - VIEWPORT_MARGIN - width;
  }
  if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;

  const spaceBelow = viewportHeight - r.bottom - PANEL_GAP - VIEWPORT_MARGIN;
  const spaceAbove = r.top - PANEL_GAP - VIEWPORT_MARGIN;
  const desired = panel ? panel.offsetHeight : estimatedHeight;

  // Prefer below; flip above only when it doesn't fit below but fits better above.
  const openBelow = desired <= spaceBelow || spaceBelow >= spaceAbove;

  let top: number;
  let maxHeight: number;
  if (openBelow) {
    top = r.bottom + PANEL_GAP;
    maxHeight = spaceBelow;
  } else {
    maxHeight = spaceAbove;
    top = r.top - PANEL_GAP - Math.min(desired, maxHeight);
  }

  return { left, top, width, maxHeight: Math.max(maxHeight, 0) };
}

function ComboboxImpl({
  value,
  onChange,
  options,
  displayValue,
  searchPlaceholder = "",
  searchAriaLabel,
  emptyMessage,
  className,
  minPanelWidth = 240,
  maxListHeight = 240,
  disabled = false,
  filters,
  filterValue,
  onFilterChange,
}: ComboboxProps) {
  const { t } = useTranslation();
  const resolvedEmptyMessage = emptyMessage ?? t("common.noResults");
  const { isMacOSTheme, isAquaGlass } = useThemeFlags();
  const { play: playOpen } = useSound(Sounds.MENU_OPEN);
  const { play: playClose } = useSound(Sounds.MENU_CLOSE);
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  // Only paint the highlight when it follows the pointer; keyboard navigation
  // (and the initial index) moves the selection silently.
  const [hovering, setHovering] = useState(false);
  const [rect, setRect] = useState<PanelRect | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const filterListRef = useRef<HTMLDivElement>(null);

  const selectedOption = useMemo(
    () => options.find((o) => o.value === value),
    [options, value]
  );

  const triggerLabel = displayValue ?? selectedOption?.label ?? value;

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const categoryOptions = filterValue
      ? options.filter((option) => option.category === filterValue)
      : options;
    if (!q) return categoryOptions;
    return categoryOptions.filter((o) =>
      optionSearchHaystack(o).includes(q)
    );
  }, [options, q, filterValue]);

  // Derive a safe index during render (no clamp effect).
  const safeHighlight =
    filtered.length === 0
      ? 0
      : Math.min(Math.max(highlight, 0), filtered.length - 1);

  const scrollHighlightIntoView = useCallback((index: number) => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-row="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, []);

  // Header (search + optional filters) height estimate used before the panel
  // has rendered and can be measured precisely.
  const estimatedHeight =
    maxListHeight + (filters && filters.length > 0 ? 96 : 56);

  const updateRect = useCallback(() => {
    const next = computePanelRect(
      triggerRef.current,
      panelRef.current,
      minPanelWidth,
      estimatedHeight
    );
    if (next) setRect(next);
  }, [minPanelWidth, estimatedHeight]);

  const openPanel = useCallback(() => {
    if (disabled) return;
    setRect(
      computePanelRect(
        triggerRef.current,
        null,
        minPanelWidth,
        estimatedHeight
      )
    );
    setQuery("");
    setHighlight(0);
    setHovering(false);
    setOpen(true);
    playOpen();
  }, [disabled, minPanelWidth, estimatedHeight, playOpen]);

  const closePanel = useCallback(() => {
    setOpen(false);
    playClose();
  }, [playClose]);

  const selectOption = useCallback(
    (option: ComboboxOption) => {
      playClick();
      onChange(option.value);
      setOpen(false);
      playClose();
    },
    [onChange, playClick, playClose]
  );

  // Single layout effect while open: focus search, outside dismiss, reposition.
  useLayoutEffect(() => {
    if (!open) return;

    inputRef.current?.focus();
    updateRect();
    filterListRef.current
      ?.querySelector<HTMLElement>('[data-filter-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" });

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      updateRect();
    };
    const onResize = () => updateRect();

    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, updateRect, filterValue]);

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filtered.length === 0) return;
      setHovering(false);
      setHighlight((h) => {
        const base = Math.min(Math.max(h, 0), filtered.length - 1);
        const next = Math.min(base + 1, filtered.length - 1);
        queueMicrotask(() => scrollHighlightIntoView(next));
        return next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filtered.length === 0) return;
      setHovering(false);
      setHighlight((h) => {
        const base = Math.min(Math.max(h, 0), filtered.length - 1);
        const next = Math.max(base - 1, 0);
        queueMicrotask(() => scrollHighlightIntoView(next));
        return next;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = filtered[safeHighlight];
      if (option) selectOption(option);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closePanel();
      triggerRef.current?.focus();
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          playClick();
          if (open) {
            closePanel();
          } else {
            openPanel();
          }
        }}
        className={cn(
          !isMacOSTheme &&
            "flex h-9 items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm [border-image:url('/assets/button.svg')_30_stretch] border-[5px] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
          isMacOSTheme &&
            "macos-select-trigger os-select-trigger-macos flex items-center justify-between whitespace-nowrap px-2 py-1 text-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
          className
        )}
      >
        <span className="line-clamp-1 text-left">{triggerLabel}</span>
        {!isMacOSTheme && (
          <CaretDown size={12} weight="bold" className="opacity-50 ml-1" />
        )}
      </button>

      {open && rect
        ? createPortal(
            // Fake the Radix popper wrapper so themed popover CSS (Aqua Glass
            // frost, dark-mode surfaces) — scoped to
            // `[data-radix-popper-content-wrapper] [role="listbox"]/[role="option"]`
            // — applies to this custom dropdown exactly like a real Select.
            <div
              ref={panelRef}
              data-radix-popper-content-wrapper=""
              style={{
                position: "fixed",
                left: rect.left,
                top: rect.top,
                width: rect.width,
                zIndex: 9999,
              }}
            >
              <div
                role="listbox"
                className={cn(
                  "flex flex-col overflow-hidden w-full",
                  !isMacOSTheme &&
                    "rounded-md border bg-popover text-popover-foreground shadow-md"
                )}
                style={
                  isMacOSTheme
                    ? {
                        maxHeight: rect.maxHeight,
                        border: "none",
                        borderRadius: "0px",
                        background: "var(--os-pinstripe-window)",
                        ...(isAquaGlass ? {} : { opacity: 0.95 }),
                        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
                      }
                    : { maxHeight: rect.maxHeight }
                }
              >
                <div className="px-2 pt-1.5 pb-1.5">
                  <SearchInput
                    inputRef={inputRef}
                    value={query}
                    onChange={(v) => {
                      setQuery(v);
                      setHighlight(0);
                      setHovering(false);
                    }}
                    onKeyDown={onInputKeyDown}
                    placeholder={searchPlaceholder}
                    ariaLabel={searchAriaLabel}
                    showClear={false}
                  />
                </div>

                {filters && filters.length > 0 ? (
                  <div
                    ref={filterListRef}
                    className="flex gap-px overflow-x-auto border-b border-os-separator px-2 pb-1.5"
                  >
                    {filters.map((filter) => {
                      const selected = filter.value === filterValue;
                      return (
                        <button
                          key={filter.value}
                          type="button"
                          aria-pressed={selected}
                          data-filter-selected={selected ? "true" : undefined}
                          onClick={() => {
                            onFilterChange?.(filter.value);
                            setHighlight(0);
                            setHovering(false);
                          }}
                          className={cn(
                            "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                            selected
                              ? "bg-os-selection-bg text-os-selection-text"
                              : "text-os-text-secondary hover:bg-os-selection-bg hover:text-os-selection-text"
                          )}
                        >
                          {filter.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                <div
                  ref={listRef}
                  className="min-h-0 flex-1 overflow-y-auto py-1"
                  style={{ maxHeight: maxListHeight }}
                >
                  {filtered.length === 0 ? (
                    <div className="px-4 py-3 text-center text-[11px] opacity-60 font-geneva-12">
                      {resolvedEmptyMessage}
                    </div>
                  ) : (
                    filtered.map((option, index) => {
                      const selected = option.value === value;
                      const highlighted =
                        hovering && index === safeHighlight;
                      const hasDescription = Boolean(option.description);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          data-row={index}
                          data-highlighted={highlighted ? "" : undefined}
                          onMouseEnter={() => {
                            setHighlight(index);
                            setHovering(true);
                          }}
                          onClick={() => selectOption(option)}
                          className={cn(
                            "group relative flex w-full cursor-default select-none items-center pl-4 pr-7 py-1.5 text-sm text-left outline-none",
                            hasDescription && "os-select-item-with-description",
                            "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                          )}
                        >
                          <span className="absolute right-2 top-2 flex size-3.5 items-center justify-center">
                            {selected ? (
                              <Check size={12} weight="bold" />
                            ) : null}
                          </span>
                          {hasDescription ? (
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <span className="truncate">{option.label}</span>
                              <span
                                className={cn(
                                  "text-[11px] font-normal leading-tight truncate",
                                  highlighted
                                    ? "text-inherit"
                                    : "text-neutral-500"
                                )}
                              >
                                {option.description}
                              </span>
                            </div>
                          ) : (
                            <span className="truncate">{option.label}</span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

export const Combobox = memo(ComboboxImpl);
