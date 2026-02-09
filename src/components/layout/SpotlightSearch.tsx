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
        background: "rgba(248, 248, 248, 0.97)",
        backgroundImage: "var(--os-pinstripe-menubar)",
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
  const fontSize = isSystem7 ? "11px" : isMac ? "13px" : "11px";
  const subtitleColor = "rgba(0,0,0,0.4)";
  const inputFontSize = isSystem7 ? "12px" : isMac ? "13px" : "11px";
  const sectionFontSize = isSystem7 ? "10px" : isMac ? "11px" : "10px";
  const rowPy = isMac ? "4px" : "3px";

  if (!isOpen) return null;

  // ── Position ─────────────────────────────────────────────────────
  const needsCenter = isMobile || !isMac;
  const panelPositionClass = isMobile
    ? "fixed z-[10004] w-[calc(100vw-32px)] max-w-[360px]"
    : isMac
    ? "fixed z-[10004] right-2 w-[280px]"
    : "fixed z-[10004] w-[320px]";

  const panelTopStyle: React.CSSProperties = isMobile
    ? {
        top: "calc(var(--os-metrics-menubar-height, 25px) + 8px)",
        left: "50%",
      }
    : isMac
    ? { top: "calc(var(--os-metrics-menubar-height, 25px) + 2px)" }
    : { top: "28%", left: "50%" };

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
            initial={{ opacity: 0, scale: 0.98, y: -4, x: needsCenter ? "-50%" : 0 }}
            animate={{ opacity: 1, scale: 1, y: 0, x: needsCenter ? "-50%" : 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -4, x: needsCenter ? "-50%" : 0 }}
            transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
            onKeyDown={handleKeyDown}
          >
            <div style={{ ...containerStyles, fontFamily }} className="overflow-hidden spotlight-panel">
              {/* Search Input Row */}
              <div
                className="flex items-center gap-1.5"
                style={{ padding: isMac ? "6px 10px" : "5px 8px" }}
              >
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
                  className="spotlight-input"
                  style={{
                    outline: "none",
                    width: "100%",
                    background: "transparent",
                    fontSize: inputFontSize,
                    fontFamily,
                    border: "none",
                    padding: 0,
                    lineHeight: "1.4",
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
                          className="spotlight-section-header select-none"
                          style={{
                            padding: "4px 10px 2px",
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
                            lineHeight: "1.3",
                          }}
                        >
                          {t(getSectionKey(group.type))}
                        </div>
                      )}

                      {/* Result items — single line: icon | title — subtitle */}
                      {group.items.map((result) => {
                        const isSelected = result.globalIndex === selectedIndex;
                        return (
                          <button
                            key={result.id}
                            type="button"
                            data-spotlight-index={result.globalIndex}
                            className="spotlight-row w-full flex items-center gap-2 cursor-default"
                            style={{
                              padding: `${rowPy} 10px`,
                              background: isSelected
                                ? getSelectedBg()
                                : "transparent",
                              color: isSelected
                                ? getSelectedTextColor()
                                : undefined,
                              fontFamily,
                              fontSize,
                              lineHeight: "1.3",
                              borderRadius:
                                currentTheme === "macosx" ? "4px" : "0px",
                              margin:
                                currentTheme === "macosx" ? "0 3px" : "0",
                              width:
                                currentTheme === "macosx"
                                  ? "calc(100% - 6px)"
                                  : "100%",
                              minHeight: isMobile ? "32px" : undefined,
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
                                className="flex-shrink-0 flex items-center justify-center leading-none w-4 h-4 text-sm"
                              >
                                {result.icon}
                              </span>
                            ) : (
                              <ThemedIcon
                                name={result.icon}
                                alt=""
                                className="flex-shrink-0 w-4 h-4 [image-rendering:pixelated]"
                              />
                            )}

                            {/* Single line: Title — Subtitle */}
                            <span className="truncate">
                              {result.title}
                              {result.subtitle && result.type !== "ai" && (
                                <span
                                  style={{
                                    color: isSelected
                                      ? "rgba(255,255,255,0.6)"
                                      : subtitleColor,
                                  }}
                                >
                                  {" — "}
                                  {result.subtitle}
                                </span>
                              )}
                            </span>
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
                  className="spotlight-no-results text-center"
                  style={{
                    padding: "12px 10px",
                    fontSize,
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
