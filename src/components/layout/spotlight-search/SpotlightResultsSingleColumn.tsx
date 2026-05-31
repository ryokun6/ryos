import { getSectionKey } from "./spotlightSectionUtils";
import { SpotlightResultIcon } from "./SpotlightResultIcon";
import type { SpotlightSearchViewModel } from "./useSpotlightSearchController";

type SpotlightResultsSingleColumnProps = {
  vm: SpotlightSearchViewModel;
};

export function SpotlightResultsSingleColumn({
  vm,
}: SpotlightResultsSingleColumnProps) {
  const {
    t,
    listRef,
    groupedResults,
    selectedIndex,
    setSelectedIndex,
    reset,
    isMacOSTheme,
    isMobile,
    getSelectedBg,
    getSelectedTextColor,
    fontFamily,
    fontSize,
    subtitleColor,
    sectionFontSize,
    rowPy,
    iconPx,
  } = vm;

  return (
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
                  background: isSelected ? getSelectedBg() : "transparent",
                  color: isSelected ? getSelectedTextColor() : undefined,
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
                onMouseEnter={() => setSelectedIndex(result.globalIndex)}
              >
                <SpotlightResultIcon
                  result={result}
                  iconPx={iconPx}
                  thumbnailBorderRadius={isMacOSTheme ? "3px" : "1px"}
                />
                <span className="truncate">
                  {result.title}
                  {result.subtitle && result.type !== "ai" && (
                    <span
                      className="spotlight-row-subtitle"
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
  );
}
