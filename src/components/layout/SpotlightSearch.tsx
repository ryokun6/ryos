import { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { useSpotlightStore } from "@/stores/useSpotlightStore";
import {
  useSpotlightSearch,
  type SpotlightResult,
} from "@/hooks/useSpotlightSearch";
import { useThemeStore } from "@/stores/useThemeStore";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { useTranslation } from "react-i18next";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";

// Section header labels by result type
const SECTION_TYPE_ORDER: SpotlightResult["type"][] = [
  "app",
  "document",
  "applet",
  "music",
  "setting",
  "command",
  "ai",
];

function getSectionKey(type: SpotlightResult["type"]): string {
  const map: Record<SpotlightResult["type"], string> = {
    app: "spotlight.sections.apps",
    document: "spotlight.sections.documents",
    applet: "spotlight.sections.applets",
    music: "spotlight.sections.music",
    setting: "spotlight.sections.settings",
    command: "spotlight.sections.commands",
    ai: "spotlight.askRyo",
  };
  return map[type];
}

export function SpotlightSearch() {
  const { t } = useTranslation();
  const { isOpen, query, selectedIndex, setQuery, setSelectedIndex, reset } =
    useSpotlightStore();
  const results = useSpotlightSearch(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isSystem7 = currentTheme === "system7";
  const isMac = currentTheme === "macosx" || isSystem7;
  const isMobile = useIsMobile();

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Listen for toggleSpotlight events
  useEffect(() => {
    const handler = () => {
      useSpotlightStore.getState().toggle();
    };
    window.addEventListener("toggleSpotlight", handler);
    return () => window.removeEventListener("toggleSpotlight", handler);
  }, []);

  // Close Spotlight when Expose view opens (mutual exclusion)
  useEffect(() => {
    const handler = () => {
      if (useSpotlightStore.getState().isOpen) {
        useSpotlightStore.getState().reset();
      }
    };
    window.addEventListener("toggleExposeView", handler);
    return () => window.removeEventListener("toggleExposeView", handler);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        reset();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(Math.min(selectedIndex + 1, results.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(Math.max(selectedIndex - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const selected = results[selectedIndex];
        if (selected) {
          selected.action();
          reset();
        }
        return;
      }
    },
    [results, selectedIndex, setSelectedIndex, reset]
  );

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector(
      `[data-spotlight-index="${selectedIndex}"]`
    );
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Group results by type for section headers
  const groupedResults = (() => {
    const groups: Array<{
      type: SpotlightResult["type"];
      items: Array<SpotlightResult & { globalIndex: number }>;
    }> = [];

    for (const type of SECTION_TYPE_ORDER) {
      const items = results
        .filter((r) => r.type === type)
        .map((r) => ({ ...r, globalIndex: 0 }));
      if (items.length > 0) {
        groups.push({ type, items });
      }
    }
    let idx = 0;
    for (const group of groups) {
      for (const item of group.items) {
        item.globalIndex = idx++;
      }
    }
    return groups;
  })();

  // ── Theme-specific container styles ──────────────────────────────
  const containerStyles = (() => {
    if (currentTheme === "macosx") {
      return {
        background: "rgba(232, 232, 232, 0.95)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderRadius: "6px",
        boxShadow:
          "0 6px 20px rgba(0, 0, 0, 0.28), 0 0 0 0.5px rgba(0, 0, 0, 0.2)",
        border: "none",
      } as React.CSSProperties;
    }
    if (isSystem7) {
      return {
        background: "#FFFFFF",
        border: "1px solid #000000",
        borderRadius: "0px",
        boxShadow: "1px 1px 0 #000000",
      } as React.CSSProperties;
    }
    if (currentTheme === "xp") {
      return {
        background: "#FFFFFF",
        border: "1px solid #7F9DB9",
        borderRadius: "3px",
        boxShadow: "0 3px 12px rgba(0, 0, 0, 0.25)",
      } as React.CSSProperties;
    }
    // Win98
    return {
      background: "#FFFFFF",
      borderRadius: "0px",
      boxShadow:
        "inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px grey, inset 2px 2px #dfdfdf, 2px 2px 6px rgba(0, 0, 0, 0.2)",
    } as React.CSSProperties;
  })();

  // ── Selection colors ─────────────────────────────────────────────
  const getSelectedBg = () => {
    if (currentTheme === "macosx") return "#1A68D1";
    if (isSystem7) return "#000000";
    return "#0055E5";
  };

  const getSelectedTextColor = () => "#FFFFFF";

  // ── Font family per theme ────────────────────────────────────────
  const fontFamily = isXpTheme
    ? "var(--font-ms-sans)"
    : isSystem7
    ? "var(--font-geneva-12)"
    : "LucidaGrande, 'Lucida Grande', ui-sans-serif, system-ui, sans-serif";

  // ── Sizing constants ─────────────────────────────────────────────
  const iconSize = isMac ? "w-4 h-4" : "w-4 h-4";
  const emojiSize = isMac ? "text-sm w-4 h-4" : "text-sm w-4 h-4";
  const fontSize = isSystem7 ? "11px" : isMac ? "13px" : "11px";
  const subtitleFontSize = isSystem7 ? "10px" : isMac ? "11px" : "10px";
  const inputFontSize = isSystem7 ? "12px" : isMac ? "13px" : "11px";
  const sectionFontSize = isSystem7 ? "10px" : isMac ? "11px" : "10px";
  const rowPadding = isMac ? "px-3 py-[5px]" : "px-3 py-[4px]";
  const inputPadding = isMac ? "px-3 py-[6px]" : "px-2 py-[5px]";

  if (!isOpen) return null;

  // ── Position: Tiger-style dropdown for Mac, centered for Windows & mobile ──
  const panelPositionClass = isMobile
    ? "fixed z-[10004] left-1/2 -translate-x-1/2 w-[calc(100vw-32px)] max-w-[360px]"
    : isMac
    ? "fixed z-[10004] right-2 w-[280px]"
    : "fixed z-[10004] left-1/2 -translate-x-1/2 w-[320px]";

  const panelTopStyle = isMobile
    ? { top: "calc(var(--os-metrics-menubar-height, 25px) + 8px)" }
    : isMac
    ? { top: "calc(var(--os-metrics-menubar-height, 25px) + 2px)" }
    : { top: "28%" };

  const overlay = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[10003]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            onClick={reset}
          />

          {/* Spotlight Panel */}
          <motion.div
            className={panelPositionClass}
            style={panelTopStyle}
            initial={{ opacity: 0, scale: 0.98, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -4 }}
            transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
            onKeyDown={handleKeyDown}
          >
            <div style={{ ...containerStyles, fontFamily }} className="overflow-hidden">
              {/* Search Input Row */}
              <div className={cn("flex items-center gap-1.5", inputPadding)}>
                <MagnifyingGlass
                  className="flex-shrink-0 w-3.5 h-3.5 opacity-50"
                  weight="bold"
                />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("spotlight.placeholder")}
                  style={{
                    outline: "none",
                    width: "100%",
                    background: "transparent",
                    fontSize: inputFontSize,
                    fontFamily,
                    border: "none",
                    padding: 0,
                  }}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>

              {/* Divider */}
              {results.length > 0 && (
                <div
                  style={{
                    height: "1px",
                    background:
                      currentTheme === "macosx"
                        ? "rgba(0,0,0,0.12)"
                        : isSystem7
                        ? "#000"
                        : "#C0C0C0",
                    margin: "0 4px",
                  }}
                />
              )}

              {/* Results */}
              {results.length > 0 && (
                <div
                  ref={listRef}
                  className="overflow-y-auto"
                  style={{ maxHeight: isMobile ? "50vh" : "320px", padding: "2px 0" }}
                >
                  {groupedResults.map((group) => (
                    <div key={group.type}>
                      {/* Section header */}
                      {group.type !== "ai" && query.trim() && (
                        <div
                          className="select-none px-3 pt-1.5 pb-0.5"
                          style={{
                            fontSize: sectionFontSize,
                            fontWeight: 600,
                            color:
                              currentTheme === "macosx"
                                ? "rgba(0,0,0,0.4)"
                                : isSystem7
                                ? "rgba(0,0,0,0.55)"
                                : currentTheme === "xp"
                                ? "#003399"
                                : "#666",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            fontFamily,
                          }}
                        >
                          {t(getSectionKey(group.type))}
                        </div>
                      )}

                      {/* Result items */}
                      {group.items.map((result) => {
                        const isSelected = result.globalIndex === selectedIndex;
                        return (
                          <button
                            key={result.id}
                            type="button"
                            data-spotlight-index={result.globalIndex}
                            className={cn(
                              "w-full flex items-center gap-2 cursor-default",
                              rowPadding
                            )}
                            style={{
                              background: isSelected
                                ? getSelectedBg()
                                : "transparent",
                              color: isSelected
                                ? getSelectedTextColor()
                                : undefined,
                              fontFamily,
                              borderRadius:
                                currentTheme === "macosx" ? "4px" : "0px",
                              margin:
                                currentTheme === "macosx" ? "0 3px" : "0",
                              width:
                                currentTheme === "macosx"
                                  ? "calc(100% - 6px)"
                                  : "100%",
                              minHeight: isMobile ? "36px" : undefined,
                            }}
                            onClick={() => {
                              result.action();
                              reset();
                            }}
                            onMouseEnter={() =>
                              setSelectedIndex(result.globalIndex)
                            }
                          >
                            {/* Icon */}
                            {result.isEmoji ? (
                              <span
                                className={cn(
                                  "flex-shrink-0 flex items-center justify-center leading-none",
                                  emojiSize
                                )}
                              >
                                {result.icon}
                              </span>
                            ) : (
                              <ThemedIcon
                                name={result.icon}
                                alt=""
                                className={cn(
                                  "flex-shrink-0 [image-rendering:pixelated]",
                                  iconSize
                                )}
                              />
                            )}

                            {/* Title + Subtitle */}
                            <div className="flex-1 min-w-0 text-left">
                              <div
                                className="truncate"
                                style={{ fontSize, lineHeight: "1.3" }}
                              >
                                {result.title}
                              </div>
                              {result.subtitle && result.type !== "ai" && (
                                <div
                                  className="truncate"
                                  style={{
                                    fontSize: subtitleFontSize,
                                    lineHeight: "1.2",
                                    color: isSelected
                                      ? "rgba(255,255,255,0.7)"
                                      : "rgba(0,0,0,0.4)",
                                  }}
                                >
                                  {result.subtitle}
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}

              {/* No results */}
              {results.length === 0 && query.trim() && (
                <div
                  className="text-center py-4"
                  style={{
                    fontSize: subtitleFontSize,
                    color: "rgba(0,0,0,0.4)",
                    fontFamily,
                  }}
                >
                  {t("spotlight.noResults")}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(overlay, document.body);
}
