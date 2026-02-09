import { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { useSpotlightStore } from "@/stores/useSpotlightStore";
import { useSpotlightSearch, type SpotlightResult } from "@/hooks/useSpotlightSearch";
import { useThemeStore } from "@/stores/useThemeStore";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { useTranslation } from "react-i18next";
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

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure the element is mounted
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
    let globalIndex = 0;

    for (const type of SECTION_TYPE_ORDER) {
      const items = results
        .filter((r) => r.type === type)
        .map((r) => ({ ...r, globalIndex: globalIndex++ }));
      if (items.length > 0) {
        // Don't add "ai" as a separate group header — just show the item
        groups.push({ type, items });
      }
    }
    // Reconcile globalIndex with actual sequential indices
    let idx = 0;
    for (const group of groups) {
      for (const item of group.items) {
        item.globalIndex = idx++;
      }
    }
    return groups;
  })();

  // Theme-specific styles
  const containerStyles = (() => {
    if (currentTheme === "macosx") {
      return {
        background: "rgba(255, 255, 255, 0.82)",
        backdropFilter: "blur(40px)",
        WebkitBackdropFilter: "blur(40px)",
        borderRadius: "12px",
        boxShadow:
          "0 20px 60px rgba(0, 0, 0, 0.3), 0 0 0 0.5px rgba(0, 0, 0, 0.15), inset 0 0.5px 0 rgba(255, 255, 255, 0.5)",
        border: "none",
      } as React.CSSProperties;
    }
    if (isSystem7) {
      return {
        background: "#FFFFFF",
        border: "2px solid #000000",
        borderRadius: "0px",
        boxShadow: "2px 2px 0 #000000",
      } as React.CSSProperties;
    }
    if (currentTheme === "xp") {
      return {
        background: "#ECE9D8",
        border: "2px solid #0055E5",
        borderRadius: "4px",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.3)",
      } as React.CSSProperties;
    }
    // Win98
    return {
      background: "#C0C0C0",
      borderRadius: "0px",
      boxShadow:
        "inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px grey, inset 2px 2px #dfdfdf, 2px 2px 8px rgba(0, 0, 0, 0.3)",
    } as React.CSSProperties;
  })();

  const inputStyles = (() => {
    const base: React.CSSProperties = {
      outline: "none",
      width: "100%",
    };
    if (currentTheme === "macosx") {
      return {
        ...base,
        background: "transparent",
        fontSize: "18px",
        padding: "12px 12px 12px 0",
        border: "none",
        fontFamily:
          "LucidaGrande, 'Lucida Grande', ui-sans-serif, system-ui, sans-serif",
      };
    }
    if (isSystem7) {
      return {
        ...base,
        background: "#FFFFFF",
        fontSize: "12px",
        padding: "6px 8px 6px 0",
        border: "none",
        fontFamily: "var(--font-geneva-12)",
      };
    }
    if (currentTheme === "xp") {
      return {
        ...base,
        background: "#FFFFFF",
        fontSize: "12px",
        padding: "6px 8px 6px 0",
        border: "1px solid #7F9DB9",
        borderRadius: "2px",
        fontFamily: "var(--font-ms-sans)",
      };
    }
    // Win98
    return {
      ...base,
      background: "#FFFFFF",
      fontSize: "11px",
      padding: "4px 6px 4px 0",
      fontFamily: "var(--font-ms-sans)",
      boxShadow:
        "inset -1px -1px #fff, inset 1px 1px #0a0a0a, inset -2px -2px #dfdfdf, inset 2px 2px grey",
    };
  })();

  const getSelectedBg = () => {
    if (currentTheme === "macosx") return "rgba(0, 95, 255, 0.12)";
    if (isSystem7) return "#000000";
    return "#0055E5";
  };

  const getSelectedTextColor = () => {
    if (currentTheme === "macosx") return undefined; // keep default
    return "#FFFFFF";
  };

  if (!isOpen) return null;

  const overlay = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[10003]"
            style={{ background: "rgba(0, 0, 0, 0.15)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={reset}
          />

          {/* Spotlight Panel */}
          <motion.div
            className="fixed z-[10004] left-1/2 w-[90vw] max-w-[520px]"
            style={{
              top: "22%",
              transform: "translateX(-50%)",
            }}
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onKeyDown={handleKeyDown}
          >
            <div style={containerStyles} className="overflow-hidden">
              {/* Search Input */}
              <div
                className={cn(
                  "flex items-center gap-2",
                  currentTheme === "macosx" && "px-4",
                  isSystem7 && "px-3 pt-2",
                  isXpTheme && "p-3"
                )}
              >
                <MagnifyingGlass
                  className={cn(
                    "flex-shrink-0",
                    currentTheme === "macosx" && "w-5 h-5 text-black/40",
                    isSystem7 && "w-3 h-3",
                    isXpTheme && "w-4 h-4"
                  )}
                  weight="bold"
                />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("spotlight.placeholder")}
                  style={inputStyles}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>

              {/* Divider */}
              {results.length > 0 && (
                <div
                  className={cn(
                    currentTheme === "macosx" && "h-px bg-black/10 mx-2",
                    isSystem7 && "h-px bg-black mx-1",
                    currentTheme === "xp" && "h-px bg-[#7F9DB9] mx-2",
                    currentTheme === "win98" && "h-px bg-gray-500 mx-1"
                  )}
                />
              )}

              {/* Results */}
              {results.length > 0 && (
                <div
                  ref={listRef}
                  className={cn(
                    "overflow-y-auto",
                    currentTheme === "macosx" && "max-h-[360px] py-1",
                    isSystem7 && "max-h-[300px] py-1",
                    isXpTheme && "max-h-[320px] py-1"
                  )}
                >
                  {groupedResults.map((group) => (
                    <div key={group.type}>
                      {/* Section header (skip for AI fallback) */}
                      {group.type !== "ai" && query.trim() && (
                        <div
                          className={cn(
                            "select-none",
                            currentTheme === "macosx" &&
                              "px-4 py-1.5 text-[11px] font-semibold text-black/40 uppercase tracking-wider",
                            isSystem7 &&
                              "px-3 py-1 text-[10px] font-bold text-black/60",
                            currentTheme === "xp" &&
                              "px-3 py-1 text-[10px] font-bold text-[#003399]",
                            currentTheme === "win98" &&
                              "px-3 py-1 text-[10px] font-bold text-gray-600"
                          )}
                          style={{
                            fontFamily: isXpTheme
                              ? "var(--font-ms-sans)"
                              : isSystem7
                              ? "var(--font-geneva-12)"
                              : undefined,
                          }}
                        >
                          {t(getSectionKey(group.type))}
                        </div>
                      )}

                      {/* Result items */}
                      {group.items.map((result) => {
                        const isSelected =
                          result.globalIndex === selectedIndex;
                        return (
                          <button
                            key={result.id}
                            type="button"
                            data-spotlight-index={result.globalIndex}
                            className={cn(
                              "w-full flex items-center gap-3 cursor-default transition-colors",
                              currentTheme === "macosx" &&
                                "px-4 py-2 rounded-lg mx-1",
                              isSystem7 && "px-3 py-1.5",
                              currentTheme === "xp" && "px-3 py-1.5",
                              currentTheme === "win98" && "px-3 py-1.5"
                            )}
                            style={{
                              background: isSelected
                                ? getSelectedBg()
                                : "transparent",
                              color: isSelected
                                ? getSelectedTextColor()
                                : undefined,
                              fontFamily: isXpTheme
                                ? "var(--font-ms-sans)"
                                : isSystem7
                                ? "var(--font-geneva-12)"
                                : undefined,
                              width: currentTheme === "macosx" ? "calc(100% - 8px)" : "100%",
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
                                  "flex-shrink-0 flex items-center justify-center",
                                  currentTheme === "macosx"
                                    ? "text-xl w-8 h-8"
                                    : "text-base w-5 h-5"
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
                                  currentTheme === "macosx"
                                    ? "w-8 h-8"
                                    : "w-5 h-5"
                                )}
                              />
                            )}

                            {/* Text */}
                            <div className="flex-1 min-w-0 text-left">
                              <div
                                className={cn(
                                  "truncate",
                                  currentTheme === "macosx" &&
                                    "text-[14px] font-medium",
                                  isSystem7 && "text-[12px]",
                                  isXpTheme && "text-[12px]"
                                )}
                              >
                                {result.title}
                              </div>
                              {result.subtitle && result.type !== "ai" && (
                                <div
                                  className={cn(
                                    "truncate",
                                    currentTheme === "macosx" &&
                                      "text-[11px] text-black/40",
                                    isSystem7 && "text-[10px] text-black/50",
                                    isXpTheme && "text-[10px]"
                                  )}
                                  style={{
                                    color:
                                      isSelected && !currentTheme.startsWith("mac")
                                        ? "rgba(255,255,255,0.7)"
                                        : undefined,
                                  }}
                                >
                                  {result.subtitle}
                                </div>
                              )}
                            </div>

                            {/* Type badge (macOS only, subtle) */}
                            {currentTheme === "macosx" &&
                              result.type !== "ai" &&
                              query.trim() && (
                                <span className="text-[10px] text-black/25 flex-shrink-0 uppercase tracking-wider">
                                  {result.type === "app"
                                    ? "⏎"
                                    : ""}
                                </span>
                              )}
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
                  className={cn(
                    "text-center py-6",
                    currentTheme === "macosx" && "text-sm text-black/40",
                    isSystem7 && "text-[12px] text-black/50",
                    isXpTheme && "text-[11px] text-gray-500"
                  )}
                  style={{
                    fontFamily: isXpTheme
                      ? "var(--font-ms-sans)"
                      : isSystem7
                      ? "var(--font-geneva-12)"
                      : undefined,
                  }}
                >
                  {t("spotlight.noResults")}
                </div>
              )}

              {/* Bottom padding for macOS */}
              {currentTheme === "macosx" && results.length > 0 && (
                <div className="h-1" />
              )}
            </div>

            {/* Keyboard shortcut hint — below the panel */}
            {currentTheme === "macosx" && (
              <div className="text-center mt-2 text-[11px] text-white/40 select-none"
                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}
              >
                esc {t("spotlight.hintClose")} · ↵ {t("spotlight.hintOpen")} · ↑↓ {t("spotlight.hintNavigate")}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(overlay, document.body);
}

