import { XCircle } from "@phosphor-icons/react";
import type { SpotlightSearchController } from "./useSpotlightSearchController";

type SpotlightSearchInputProps = Pick<
  SpotlightSearchController,
  | "t"
  | "query"
  | "setQuery"
  | "inputRef"
  | "isMacOSTheme"
  | "isMobile"
  | "fontFamily"
  | "inputFontSize"
  | "mobileInputPadding"
  | "mobileInputFontSize"
  | "isMac"
>;

export function SpotlightSearchInput({
  t,
  query,
  setQuery,
  inputRef,
  isMacOSTheme,
  isMobile,
  fontFamily,
  inputFontSize,
  mobileInputPadding,
  mobileInputFontSize,
  isMac,
}: SpotlightSearchInputProps) {
  if (isMacOSTheme) {
    return (
      <div
        className="flex items-center gap-2.5"
        style={{
          padding: isMobile ? "7px 8px" : "6px 8px 6px 12px",
          background:
            "var(--os-accent-list-gradient, linear-gradient(180deg, #609de9 0%, #3d84e5 50%, #3170dc 100%))",
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
              color: "var(--os-color-selection-text, #FFFFFF)",
              textShadow:
                "var(--os-accent-selection-text-shadow, 0 1px 1px rgba(0,0,0,0.3))",
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
          className="flex items-center flex-1 spotlight-input-well"
          style={{
            background: "#FFFFFF",
            borderRadius: isMobile ? "24px" : "12px",
            border: "none",
            boxShadow:
              "inset 0 1px 2px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.15), 0 1px 0 rgba(255,255,255,0.2)",
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
    );
  }

  return (
    <div
      className="flex items-center"
      style={{
        padding: isMobile ? mobileInputPadding : isMac ? "6px 10px" : "5px 8px",
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
  );
}
