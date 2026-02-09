import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { XCircle } from "@phosphor-icons/react";
import { useSpotlightStore } from "@/stores/useSpotlightStore";
import {
  useSpotlightSearch,
  type SpotlightResult,
} from "@/hooks/useSpotlightSearch";
import { useThemeStore } from "@/stores/useThemeStore";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { useTranslation } from "react-i18next";
import { useIsMobile } from "@/hooks/useIsMobile";
import { isTauri, isTauriWindows } from "@/utils/platform";

// Section header labels by result type
const SECTION_TYPE_ORDER: SpotlightResult["type"][] = [
  "app",
  "document",
  "applet",
  "music",
  "site",
  "video",
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
    site: "spotlight.sections.sites",
    video: "spotlight.sections.videos",
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
  const proxyInputRef = useRef<HTMLInputElement>(null);
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isSystem7 = currentTheme === "system7";
  const isMac = currentTheme === "macosx" || isSystem7;
  const isMobile = useIsMobile();

  // Focus input when opening. For XP/98, Start menu dropdown steals focus on close
  // so we delay and re-focus to reclaim after its cleanup.
  useEffect(() => {
    if (!isOpen) return;
    const focusInput = () => inputRef.current?.focus();
    // On mobile, the proxy input already has the keyboard open — transfer focus quickly
    if (isMobile) {
      requestAnimationFrame(focusInput);
      return;
    }
    const delay = isXpTheme ? 150 : 0;
    const id = setTimeout(() => {
      requestAnimationFrame(focusInput);
      if (isXpTheme) {
        reclaimId = setTimeout(() => requestAnimationFrame(focusInput), 100);
      }
    }, delay);
    let reclaimId: ReturnType<typeof setTimeout> | undefined;
    return () => {
      clearTimeout(id);
      if (reclaimId) clearTimeout(reclaimId);
    };
  }, [isOpen, isXpTheme, isMobile]);

  // Listen for toggleSpotlight events.
  // On mobile, pre-focus a proxy input to open the keyboard within the user gesture chain,
  // then the real input will steal focus once it mounts.
  useEffect(() => {
    const handler = () => {
      const state = useSpotlightStore.getState();
      if (!state.isOpen && isMobile && proxyInputRef.current) {
        // Focus proxy input immediately in the user-gesture call stack to raise the keyboard
        proxyInputRef.current.focus();
      }
      state.toggle();
    };
    window.addEventListener("toggleSpotlight", handler);
    return () => window.removeEventListener("toggleSpotlight", handler);
  }, [isMobile]);

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

  // ── Theme-specific container styles ──────────────────────────────
  const containerStyles = (() => {
    if (currentTheme === "macosx") {
      return {
        background: "var(--os-pinstripe-window)",
        borderRadius: isMobile ? "var(--os-metrics-radius, 0.45rem)" : "0px",
        border: "none",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
      } as React.CSSProperties;
    }
    if (isSystem7) {
      // Match System 7 window frame: 1px black border + classic Mac shadow
      return {
        background: "#FFFFFF",
        border: "1px solid #000000",
        borderRadius: "0px",
        boxShadow: "2px 2px 0px 0px rgba(0, 0, 0, 0.5)",
      } as React.CSSProperties;
    }
    if (currentTheme === "xp") {
      // Clean XP menu style — thin border, soft shadow
      return {
        background: "#FFFFFF",
        border: "1px solid #ACA899",
        borderRadius: "2px",
        boxShadow: "2px 2px 6px rgba(0, 0, 0, 0.2)",
      } as React.CSSProperties;
    }
    // Win98 — simple raised border like a classic menu popup
    return {
      background: "#FFFFFF",
      border: "1px solid #808080",
      borderRadius: "0px",
      boxShadow: "1px 1px 0 #000000",
    } as React.CSSProperties;
  })();

  // ── Selection colors ─────────────────────────────────────────────
  const getSelectedBg = () => {
    if (currentTheme === "macosx") return "var(--os-color-selection-bg)";
    if (isSystem7) return "#000000";
    if (currentTheme === "win98") return "#000080";
    return "#316AC5"; // XP Luna
  };

  const getSelectedTextColor = () => "#FFFFFF";

  // ── Font family per theme ────────────────────────────────────────
  const fontFamily = isXpTheme
    ? "var(--font-ms-sans)"
    : isSystem7
    ? "'Geneva-12', 'ArkPixel', system-ui, sans-serif"
    : "LucidaGrande, 'Lucida Grande', ui-sans-serif, system-ui, sans-serif";

  // ── Sizing constants ─────────────────────────────────────────────
  const fontSize = isSystem7 ? "11px" : isMac ? "13px" : "11px";
  const subtitleColor = "rgba(0,0,0,0.4)";
  const inputFontSize = isSystem7 ? "12px" : isMac ? "13px" : "11px";
  const sectionFontSize = isSystem7 ? "10px" : isMac ? "11px" : "10px";
  const rowPy = isMac ? "3px" : "3px";
  const iconPx = isMac ? 20 : 18; // icon size in px

  // Track whether spotlight was ever open so we always render the portal
  // once opened (allowing AnimatePresence exit animations to play).
  const [hasBeenOpen, setHasBeenOpen] = useState(isOpen);
  useEffect(() => {
    if (isOpen) setHasBeenOpen(true);
  }, [isOpen]);

  // ── Position ─────────────────────────────────────────────────────
  const needsCenter = isMobile || !isMac;
  const useTwoColumn =
    currentTheme === "macosx" && !isMobile && groupedResults.length > 0;
  const panelPositionClass = isMobile
    ? "fixed z-[10004] w-[calc(100vw-24px)] max-w-[480px]"
    : isMac
    ? `fixed z-[10004] right-2 ${useTwoColumn ? "w-[380px]" : "w-[260px]"}`
    : "fixed z-[10004] w-[320px]";

  // In Tauri on Mac (WebKit), the menubar is taller (32px) to accommodate traffic lights
  const isTauriApp = isTauri();
  const isTauriMacMenubar = isTauriApp && !isTauriWindows() && isMac;
  const menubarTop = isTauriMacMenubar ? "32px" : "var(--os-metrics-menubar-height, 25px)";

  const panelTopStyle: React.CSSProperties = isMobile
    ? {
        top: isSystem7 ? `calc(${menubarTop} + 32px - 1px)` : `calc(${menubarTop} + 32px)`,
        left: "50%",
      }
    : isMac
    ? { top: isSystem7 ? `calc(${menubarTop} - 1px)` : menubarTop }
    : { top: "28%", left: "50%" };

  // Mobile input sizing
  const mobileInputPadding = "6px 10px";
  const mobileInputFontSize = "16px"; // also prevents iOS Safari zoom

  // Don't render anything until spotlight has been opened at least once
  if (!hasBeenOpen) {
    // On mobile, render a hidden proxy input so we can focus it during the user-gesture
    // call stack (before React re-renders with isOpen=true) to raise the keyboard.
    if (isMobile) {
      return createPortal(
        <input
          ref={proxyInputRef}
          aria-hidden="true"
          tabIndex={-1}
          style={{
            position: "fixed",
            opacity: 0,
            pointerEvents: "none",
            top: 0,
            left: 0,
            width: 0,
            height: 0,
            fontSize: "16px", // prevent iOS Safari zoom
            border: "none",
            padding: 0,
            margin: 0,
          }}
        />,
        document.body
      );
    }
    return null;
  }

  const overlay = (
    <>
      {/* Mobile proxy input — always in the DOM for keyboard focus trick */}
      {isMobile && !isOpen && (
        <input
          ref={proxyInputRef}
          aria-hidden="true"
          tabIndex={-1}
          style={{
            position: "fixed",
            opacity: 0,
            pointerEvents: "none",
            top: 0,
            left: 0,
            width: 0,
            height: 0,
            fontSize: "16px",
            border: "none",
            padding: 0,
            margin: 0,
          }}
        />
      )}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-[10003]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              onClick={reset}
            />

            {/* Spotlight Panel */}
            <motion.div
              className={panelPositionClass}
              style={panelTopStyle}
              initial={{ opacity: 0, scale: 0.96, y: -8, x: needsCenter ? "-50%" : 0 }}
              animate={{ opacity: 1, scale: 1, y: 0, x: needsCenter ? "-50%" : 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -8, x: needsCenter ? "-50%" : 0 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              onKeyDown={handleKeyDown}
            >
              <div style={{ ...containerStyles, fontFamily }} className="overflow-hidden spotlight-panel">
                {/* Search Input Row */}
                {currentTheme === "macosx" ? (
                  <div
                    className="flex items-center gap-2.5"
                    style={{
                      padding: isMobile ? "7px 8px" : "6px 8px 6px 12px",
                      background: "linear-gradient(180deg, #609de9 0%, #3d84e5 50%, #3170dc 100%)",
                      borderBottom: "1px solid rgba(0,0,0,0.15)",
                    }}
                  >
                    {!isMobile && (
                      <span
                        className="spotlight-title"
                        style={{
                          fontFamily,
                          fontSize: "12px",
                          fontWeight: 700,
                          color: "#FFFFFF",
                          textShadow: "0 1px 1px rgba(0,0,0,0.3)",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                          userSelect: "none",
                          width: "100px",
                          textAlign: "right",
                          display: "inline-block",
                        }}
                      >
                        {t("spotlight.title", "Spotlight")}
                      </span>
                    )}
                    <div
                      className="flex items-center flex-1"
                      style={{
                        background: "#FFFFFF",
                        borderRadius: isMobile ? "24px" : "12px",
                        border: "none",
                        boxShadow: "inset 0 1px 2px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.15), 0 1px 0 rgba(255,255,255,0.2)",
                        padding: isMobile ? "2px 6px 2px 12px" : "3px 6px 3px 10px",
                        minHeight: isMobile ? "28px" : "22px",
                      }}
                    >
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
                          fontSize: isMobile ? mobileInputFontSize : "12px",
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
                      {query && (
                        <button
                          type="button"
                          onClick={() => setQuery("")}
                          className="flex-shrink-0 flex items-center justify-center"
                          style={{
                            color: "#8E8E93",
                            marginLeft: "2px",
                          }}
                          aria-label={t("spotlight.ariaLabels.clearSearch")}
                        >
                          <XCircle size={isMobile ? 20 : 16} weight="fill" />
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    className="flex items-center"
                    style={{ padding: isMobile ? mobileInputPadding : (isMac ? "6px 10px" : "5px 8px") }}
                  >
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
                        fontSize: isMobile ? mobileInputFontSize : inputFontSize,
                        fontFamily,
                        border: "none",
                        padding: 0,
                        lineHeight: isMobile ? "1.6" : "1.4",
                      }}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                    />
                  </div>
                )}

                {/* Divider between input and results (not needed for macosx — blue header has border) */}
                {results.length > 0 && currentTheme !== "macosx" && (
                  <div
                    style={
                      isSystem7
                        ? {
                            height: "1px",
                            margin: 0,
                            borderTop: "1px dotted #000000",
                            background: "transparent",
                          }
                        : {
                            height: "1px",
                            background: "rgba(0,0,0,0.1)",
                            margin: isMac ? "0 4px" : "0",
                          }
                    }
                  />
                )}

                {/* Results — two-column (headers left) for macosx desktop, single-column otherwise */}
                {results.length > 0 &&
                  (useTwoColumn ? (
                    <div
                      ref={listRef}
                      className="overflow-y-auto"
                      style={{ maxHeight: "320px" }}
                    >
                      <table
                        className="w-full border-collapse"
                        style={{ fontFamily, tableLayout: "fixed" }}
                      >
                        <colgroup>
                          <col style={{ width: "120px" }} />
                          <col />
                        </colgroup>
                        <tbody>
                          {/* Top spacer */}
                          <tr>
                            <td style={{ height: "4px", padding: 0, borderRight: "1px solid rgba(0,0,0,0.1)" }} />
                            <td style={{ height: "4px", padding: 0, background: "rgba(0,0,0,0.04)" }} />
                          </tr>
                          {groupedResults.flatMap((group, groupIdx) => {
                            const rows: React.ReactNode[] = [];
                            const sectionLabel = t(
                              group.items[0]?.sectionLabel ||
                                getSectionKey(group.type)
                            );
                            if (groupIdx > 0) {
                              rows.push(
                                <tr key={`spacer-${group.type}`}>
                                  <td
                                    style={{
                                      height: "8px",
                                      padding: 0,
                                      borderRight: "1px solid rgba(0,0,0,0.1)",
                                    }}
                                  />
                                  <td
                                    style={{
                                      height: "8px",
                                      padding: 0,
                                      background: "rgba(0,0,0,0.04)",
                                    }}
                                  />
                                </tr>
                              );
                            }
                            group.items.forEach((result, idx) => {
                              const isSelected = result.globalIndex === selectedIndex;
                              rows.push(
                              <tr
                                key={result.id}
                                style={{
                                  background: isSelected
                                    ? getSelectedBg()
                                    : "transparent",
                                }}
                              >
                                <td
                                  className="spotlight-section-header align-top select-none"
                                  style={{
                                    width: "120px",
                                    padding: "4px 8px",
                                    textAlign: "right",
                                    fontSize: sectionFontSize,
                                    fontWeight: "normal",
                                    color: isSelected
                                      ? getSelectedTextColor()
                                      : "rgba(0,0,0,0.5)",
                                    lineHeight: "1.3",
                                    background: "transparent",
                                    borderRight: isSelected
                                      ? "none"
                                      : "1px solid rgba(0,0,0,0.1)",
                                    verticalAlign: "middle",
                                  }}
                                >
                                  {idx === 0 && group.type !== "ai"
                                    ? t(
                                        group.items[0]?.sectionLabel ||
                                          getSectionKey(group.type)
                                      )
                                    : ""}
                                </td>
                                <td
                                  style={{
                                    padding: 0,
                                    background: isSelected
                                      ? "transparent"
                                      : "rgba(0,0,0,0.04)",
                                    border: "none",
                                    verticalAlign: "middle",
                                    overflow: "hidden",
                                  }}
                                >
                                  <button
                                        type="button"
                                        data-spotlight-index={result.globalIndex}
                                        className="spotlight-row w-full flex items-center gap-2 cursor-default text-left overflow-hidden"
                                        data-selected={
                                          isSelected ? true : undefined
                                        }
                                        style={{
                                          padding: `${rowPy} 10px`,
                                          background: "transparent",
                                          color: isSelected
                                              ? getSelectedTextColor()
                                              : undefined,
                                          fontFamily,
                                          fontSize,
                                          lineHeight: "1.3",
                                          border: "none",
                                          margin: 0,
                                          width: "100%",
                                        }}
                                        onClick={() => {
                                          result.action();
                                          reset();
                                        }}
                                        onMouseEnter={() =>
                                          setSelectedIndex(result.globalIndex)
                                        }
                                      >
                                        {result.thumbnail ? (
                                          <img
                                            src={result.thumbnail}
                                            alt=""
                                            className="flex-shrink-0 object-cover"
                                            style={{
                                              width: iconPx,
                                              height: iconPx,
                                              borderRadius: "3px",
                                            }}
                                            loading="lazy"
                                            onError={(e) => {
                                              (
                                                e.target as HTMLImageElement
                                              ).style.display = "none";
                                            }}
                                          />
                                        ) : result.isEmoji ? (
                                          <span
                                            className="flex-shrink-0 flex items-center justify-center leading-none"
                                            style={{
                                              width: iconPx,
                                              height: iconPx,
                                              fontSize: `${iconPx - 4}px`,
                                            }}
                                          >
                                            {result.icon}
                                          </span>
                                        ) : (
                                          <ThemedIcon
                                            name={result.icon}
                                            alt=""
                                            className="flex-shrink-0 [image-rendering:pixelated]"
                                            style={{
                                              width: iconPx,
                                              height: iconPx,
                                            }}
                                          />
                                        )}
                                        <span className="truncate">
                                          {result.title}
                                          {result.subtitle &&
                                            result.type !== "ai" &&
                                            result.subtitle !== sectionLabel && (
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
                                </td>
                              </tr>
                              );
                            });
                            return rows;
                          })}
                          {/* Bottom spacer */}
                          <tr>
                            <td style={{ height: "4px", padding: 0, borderRight: "1px solid rgba(0,0,0,0.1)" }} />
                            <td style={{ height: "4px", padding: 0, background: "rgba(0,0,0,0.04)" }} />
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div
                      ref={listRef}
                      className="overflow-y-auto"
                      style={{
                        maxHeight: isMobile ? "50vh" : "320px",
                        padding: "2px 0",
                      }}
                    >
                      {groupedResults.map((group) => (
                      <div key={group.type}>
                        {/* Section header — always shown (use sectionLabel override or category) */}
                        {group.type !== "ai" && (
                          <div
                            className="spotlight-section-header select-none"
                            style={{
                              padding: isMobile ? "6px 12px 2px" : "4px 12px 2px",
                              fontSize: sectionFontSize,
                              fontWeight: "normal",
                              color: "rgba(0,0,0,0.4)",
                              fontFamily,
                              lineHeight: "1.3",
                            }}
                          >
                            {t(group.items[0]?.sectionLabel || getSectionKey(group.type))}
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
                              data-selected={isSelected || undefined}
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
                                borderRadius: "0px",
                                margin: "0",
                                width: "100%",
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
                              {/* Icon / Thumbnail */}
                              {result.thumbnail ? (
                                <img
                                  src={result.thumbnail}
                                  alt=""
                                  className="flex-shrink-0 object-cover"
                                  style={{
                                    width: iconPx,
                                    height: iconPx,
                                    borderRadius: currentTheme === "macosx" ? "3px" : "1px",
                                  }}
                                  loading="lazy"
                                  onError={(e) => {
                                    // Hide broken thumbnails
                                    (e.target as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              ) : result.isEmoji ? (
                                <span
                                  className="flex-shrink-0 flex items-center justify-center leading-none"
                                  style={{ width: iconPx, height: iconPx, fontSize: `${iconPx - 4}px` }}
                                >
                                  {result.icon}
                                </span>
                              ) : (
                                <ThemedIcon
                                  name={result.icon}
                                  alt=""
                                  className="flex-shrink-0 [image-rendering:pixelated]"
                                  style={{ width: iconPx, height: iconPx }}
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
                  ))}

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
    </>
  );

  return createPortal(overlay, document.body);
}
