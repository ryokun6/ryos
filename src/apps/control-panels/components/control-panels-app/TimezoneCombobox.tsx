import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { CaretDown, Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useSound, Sounds } from "@/hooks/useSound";
import { SearchInput } from "@/components/ui/search-input";
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
  offsetLabel: string;
  description: string;
  search: string;
};

function buildZoneOptions(): ZoneOption[] {
  const now = new Date();
  return getSupportedTimezones().map((id) => {
    const slash = id.indexOf("/");
    const region = slash === -1 ? "" : id.slice(0, slash).replace(/_/g, " ");
    const city = formatTimezoneCity(id);
    const offsetLabel = formatOffsetLabel(getTimezoneOffsetMinutes(id, now));
    return {
      id,
      city,
      region,
      offsetLabel,
      description: region ? `${region} · ${offsetLabel}` : offsetLabel,
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

function TimezoneComboboxImpl({
  value,
  onChange,
  t,
  className,
}: TimezoneComboboxProps) {
  const { isMacOSTheme, isAquaGlass } = useThemeFlags();
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

  const autoCity = useMemo(
    () => formatTimezoneCity(resolveEffectiveTimezone(AUTO_TIMEZONE)),
    []
  );

  const triggerLabel = useMemo(() => {
    if (value === AUTO_TIMEZONE) {
      return t("apps.control-panels.timezoneAutomaticCity", { city: autoCity });
    }
    const city = formatTimezoneCity(value);
    const offset = formatOffsetLabel(getTimezoneOffsetMinutes(value));
    return `${city} (${offset})`;
  }, [value, t, autoCity]);

  const q = query.trim().toLowerCase();
  const filteredZones = useMemo(() => {
    if (!q) return zoneOptions;
    return zoneOptions.filter((z) => z.search.includes(q));
  }, [zoneOptions, q]);

  const automaticMatches =
    !q ||
    t("apps.control-panels.timezoneAutomatic").toLowerCase().includes(q) ||
    "automatic".includes(q);

  type Row = { kind: "auto" } | { kind: "zone"; zone: ZoneOption };
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
    setRect({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 240) });
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
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  // Close on outside interaction; follow the trigger when ancestors scroll.
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
    };
    const onScroll = (e: Event) => {
      // Reposition (don't close) unless the dropdown's own list scrolled.
      if (panelRef.current?.contains(e.target as Node)) return;
      updateRect();
    };
    const onResize = () => updateRect();
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, updateRect]);

  // Keep the highlighted row in view.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-row="${highlight}"]`)
      ?.scrollIntoView({ block: "nearest" });
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
      triggerRef.current?.focus();
    }
  };

  const currentId = value;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          playClick();
          if (open) {
            closePanel();
          } else {
            openPanel();
          }
        }}
        className={cn(
          !isMacOSTheme &&
            "flex h-9 items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm [border-image:url('/assets/button.svg')_30_stretch] border-[5px] focus:outline-none [&>span]:line-clamp-1",
          isMacOSTheme &&
            "macos-select-trigger os-select-trigger-macos flex items-center justify-between whitespace-nowrap px-2 py-1 text-sm focus:outline-none [&>span]:line-clamp-1",
          "w-[180px] flex-shrink-0",
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
                        border: "none",
                        borderRadius: "0px",
                        background: "var(--os-pinstripe-window)",
                        ...(isAquaGlass ? {} : { opacity: 0.95 }),
                        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
                      }
                    : undefined
                }
              >
                <div className="px-2 pt-1.5 pb-1.5 border-b border-black/15">
                <SearchInput
                  inputRef={inputRef}
                  value={query}
                  onChange={(v) => {
                    setQuery(v);
                    setHighlight(0);
                  }}
                  onKeyDown={onInputKeyDown}
                  placeholder={t(
                    "apps.control-panels.timezoneSearchPlaceholder"
                  )}
                  ariaLabel={t("apps.control-panels.timeZone")}
                  showClear={false}
                />
              </div>

              <div ref={listRef} className="max-h-[240px] overflow-y-auto py-1">
                {rows.length === 0 ? (
                  <div className="px-4 py-3 text-center text-[11px] opacity-60 font-geneva-12">
                    {t("apps.control-panels.timezoneNoResults")}
                  </div>
                ) : (
                  rows.map((row, index) => {
                    const isAuto = row.kind === "auto";
                    const rowId = isAuto ? AUTO_TIMEZONE : row.zone.id;
                    const selected = rowId === currentId;
                    const active = index === highlight;
                    const label = isAuto
                      ? t("apps.control-panels.timezoneAutomatic")
                      : row.zone.city;
                    const description = isAuto ? autoCity : row.zone.description;
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
                          "os-select-item-with-description group relative flex w-full cursor-default select-none items-center pl-4 pr-7 py-1.5 text-sm text-left outline-none",
                          active && "bg-accent text-accent-foreground"
                        )}
                      >
                        <span className="absolute right-2 top-2 flex size-3.5 items-center justify-center">
                          {selected ? <Check size={12} weight="bold" /> : null}
                        </span>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate">{label}</span>
                          <span
                            className={cn(
                              "text-[11px] font-normal leading-tight truncate",
                              active ? "text-inherit" : "text-neutral-500"
                            )}
                          >
                            {description}
                          </span>
                        </div>
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

export const TimezoneCombobox = memo(TimezoneComboboxImpl);
