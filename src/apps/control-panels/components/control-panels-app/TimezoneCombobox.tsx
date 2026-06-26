import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { CaretDown, MagnifyingGlass, Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useSound, Sounds } from "@/hooks/useSound";
import {
  AUTO_TIMEZONE,
  formatOffsetLabel,
  formatTimezoneCity,
  getSupportedTimezones,
  getTimezoneOffsetMinutes,
  resolveEffectiveTimezone,
  type TimezonePreference,
} from "@/lib/timezoneConfig";

type ZoneOption = {
  id: string;
  city: string;
  region: string;
  offsetMinutes: number;
  offsetLabel: string;
  search: string;
};

function buildZoneOptions(): ZoneOption[] {
  const now = new Date();
  return getSupportedTimezones().map((id) => {
    const slash = id.indexOf("/");
    const region = slash === -1 ? "" : id.slice(0, slash).replace(/_/g, " ");
    const city = formatTimezoneCity(id);
    const offsetMinutes = getTimezoneOffsetMinutes(id, now);
    const offsetLabel = formatOffsetLabel(offsetMinutes);
    return {
      id,
      city,
      region,
      offsetMinutes,
      offsetLabel,
      search: `${id} ${city} ${region} ${offsetLabel}`.toLowerCase(),
    };
  });
}

export type TimezoneComboboxProps = {
  value: TimezonePreference;
  onChange: (value: TimezonePreference) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
  className?: string;
};

export function TimezoneCombobox({
  value,
  onChange,
  t,
  className,
}: TimezoneComboboxProps) {
  const { isMacOSTheme } = useThemeFlags();
  const { play: playOpen } = useSound(Sounds.MENU_OPEN);
  const { play: playClose } = useSound(Sounds.MENU_CLOSE);
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [rect, setRect] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Computing offsets for every zone is non-trivial; do it once.
  const zoneOptions = useMemo(() => buildZoneOptions(), []);

  const triggerLabel = useMemo(() => {
    if (value === AUTO_TIMEZONE) {
      const city = formatTimezoneCity(resolveEffectiveTimezone(AUTO_TIMEZONE));
      return t("apps.control-panels.timezoneAutomaticCity", { city });
    }
    const city = formatTimezoneCity(value);
    const offset = formatOffsetLabel(getTimezoneOffsetMinutes(value));
    return `${city} (${offset})`;
  }, [value, t]);

  const q = query.trim().toLowerCase();
  const filteredZones = useMemo(() => {
    if (!q) return zoneOptions;
    return zoneOptions.filter((z) => z.search.includes(q));
  }, [zoneOptions, q]);

  const automaticMatches =
    !q ||
    t("apps.control-panels.timezoneAutomatic").toLowerCase().includes(q) ||
    "automatic".includes(q);

  type Row =
    | { kind: "auto" }
    | { kind: "zone"; zone: ZoneOption };
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (automaticMatches) out.push({ kind: "auto" });
    for (const zone of filteredZones) out.push({ kind: "zone", zone });
    return out;
  }, [automaticMatches, filteredZones]);

  const updateRect = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({
      left: r.left,
      top: r.bottom + 4,
      width: Math.max(r.width, 240),
    });
  }, []);

  const openPanel = useCallback(() => {
    updateRect();
    setQuery("");
    setHighlight(0);
    setOpen(true);
    playOpen();
  }, [updateRect, playOpen]);

  const closePanel = useCallback(() => {
    setOpen(false);
    playClose();
    triggerRef.current?.focus();
  }, [playClose]);

  const selectRow = useCallback(
    (row: Row) => {
      playClick();
      onChange(row.kind === "auto" ? AUTO_TIMEZONE : row.zone.id);
      setOpen(false);
      playClose();
    },
    [onChange, playClick, playClose]
  );

  useLayoutEffect(() => {
    if (open) updateRect();
  }, [open, updateRect]);

  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // Close on outside interaction; reposition on resize.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
      playClose();
    };
    const onResize = () => setOpen(false);
    const onScroll = (e: Event) => {
      // Ignore scrolling within the dropdown's own list.
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, playClose]);

  // Keep the highlighted row in view.
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const node = list?.querySelector<HTMLElement>(`[data-row="${highlight}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[highlight];
      if (row) selectRow(row);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closePanel();
    }
  };

  const currentId = value === AUTO_TIMEZONE ? AUTO_TIMEZONE : value;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? closePanel() : openPanel())}
        className={cn(
          !isMacOSTheme &&
            "flex h-9 items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm [border-image:url('/assets/button.svg')_30_stretch] border-[5px] focus:outline-none",
          isMacOSTheme &&
            "macos-select-trigger os-select-trigger-macos flex items-center justify-between whitespace-nowrap px-2 py-1 text-sm focus:outline-none",
          "w-[180px] flex-shrink-0",
          className
        )}
      >
        <span className="line-clamp-1 text-left">{triggerLabel}</span>
        <CaretDown size={12} weight="bold" className="opacity-50 ml-1" />
      </button>

      {open && rect
        ? createPortal(
            <div
              ref={panelRef}
              role="listbox"
              className="fixed z-[9999] flex flex-col rounded-md border border-black/20 bg-popover text-popover-foreground shadow-lg overflow-hidden"
              style={{
                left: rect.left,
                top: rect.top,
                width: rect.width,
                background: isMacOSTheme
                  ? "var(--os-pinstripe-window)"
                  : undefined,
              }}
            >
              <div className="flex items-center gap-1.5 border-b border-black/10 px-2 py-1.5">
                <MagnifyingGlass
                  size={12}
                  weight="bold"
                  className="opacity-40 flex-shrink-0"
                />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setHighlight(0);
                  }}
                  onKeyDown={onInputKeyDown}
                  placeholder={t("apps.control-panels.timezoneSearchPlaceholder")}
                  className="flex-1 bg-transparent text-[12px] outline-none placeholder:opacity-40"
                />
              </div>

              <div
                ref={listRef}
                className="max-h-[240px] overflow-y-auto py-1"
              >
                {rows.length === 0 ? (
                  <div className="px-3 py-3 text-center text-[11px] opacity-50">
                    {t("apps.control-panels.timezoneNoResults")}
                  </div>
                ) : (
                  rows.map((row, index) => {
                    const isAuto = row.kind === "auto";
                    const rowId = isAuto ? AUTO_TIMEZONE : row.zone.id;
                    const selected = rowId === currentId;
                    const active = index === highlight;
                    return (
                      <button
                        key={rowId}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        data-row={index}
                        onMouseEnter={() => setHighlight(index)}
                        onClick={() => selectRow(row)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[12px]",
                          active && "bg-accent text-accent-foreground"
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Check
                            size={11}
                            weight="bold"
                            className={cn(
                              "flex-shrink-0",
                              selected ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span className="truncate">
                            {isAuto
                              ? t("apps.control-panels.timezoneAutomatic")
                              : row.zone.city}
                          </span>
                        </span>
                        {!isAuto && (
                          <span className="flex-shrink-0 text-[10px] opacity-50">
                            {row.zone.region
                              ? `${row.zone.region} · ${row.zone.offsetLabel}`
                              : row.zone.offsetLabel}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
