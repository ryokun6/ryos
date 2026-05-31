import { SpotlightSearchInput } from "./SpotlightSearchInput";
import { SpotlightResultsTwoColumn } from "./SpotlightResultsTwoColumn";
import { SpotlightResultsSingleColumn } from "./SpotlightResultsSingleColumn";
import type { SpotlightSearchController } from "./useSpotlightSearchController";

type SpotlightSearchPanelProps = {
  ctrl: SpotlightSearchController;
};

export function SpotlightSearchPanel({ ctrl }: SpotlightSearchPanelProps) {
  const {
    results,
    isSearching,
    query,
    isMacOSTheme,
    isSystem7,
    isMac,
    useTwoColumn,
    containerStyles,
    fontFamily,
    fontSize,
  } = ctrl;

  return (
    <div
      style={{ ...containerStyles, fontFamily }}
      className="overflow-hidden spotlight-panel"
    >
      <SpotlightSearchInput
        t={ctrl.t}
        query={ctrl.query}
        setQuery={ctrl.setQuery}
        inputRef={ctrl.inputRef}
        isMacOSTheme={ctrl.isMacOSTheme}
        isMobile={ctrl.isMobile}
        fontFamily={ctrl.fontFamily}
        inputFontSize={ctrl.inputFontSize}
        mobileInputPadding={ctrl.mobileInputPadding}
        mobileInputFontSize={ctrl.mobileInputFontSize}
        isMac={ctrl.isMac}
      />

      {results.length > 0 && !isMacOSTheme && (
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

      {results.length > 0 &&
        (useTwoColumn ? (
          <SpotlightResultsTwoColumn
            t={ctrl.t}
            groupedResults={ctrl.groupedResults}
            selectedIndex={ctrl.selectedIndex}
            setSelectedIndex={ctrl.setSelectedIndex}
            listRef={ctrl.listRef}
            fontFamily={ctrl.fontFamily}
            sectionFontSize={ctrl.sectionFontSize}
            fontSize={ctrl.fontSize}
            rowPy={ctrl.rowPy}
            iconPx={ctrl.iconPx}
            subtitleColor={ctrl.subtitleColor}
            getSelectedBg={ctrl.getSelectedBg}
            getSelectedTextColor={ctrl.getSelectedTextColor}
            activateResult={ctrl.activateResult}
          />
        ) : (
          <SpotlightResultsSingleColumn
            t={ctrl.t}
            groupedResults={ctrl.groupedResults}
            selectedIndex={ctrl.selectedIndex}
            setSelectedIndex={ctrl.setSelectedIndex}
            listRef={ctrl.listRef}
            fontFamily={ctrl.fontFamily}
            sectionFontSize={ctrl.sectionFontSize}
            fontSize={ctrl.fontSize}
            rowPy={ctrl.rowPy}
            iconPx={ctrl.iconPx}
            subtitleColor={ctrl.subtitleColor}
            isMobile={ctrl.isMobile}
            isMacOSTheme={ctrl.isMacOSTheme}
            getSelectedBg={ctrl.getSelectedBg}
            getSelectedTextColor={ctrl.getSelectedTextColor}
            activateResult={ctrl.activateResult}
          />
        ))}

      {results.length === 0 && query.trim() && !isSearching && (
        <div
          className="spotlight-no-results text-center"
          style={{
            padding: "12px 10px",
            fontSize,
            color: "rgba(0,0,0,0.4)",
            fontFamily,
          }}
        >
          {ctrl.t("spotlight.noResults")}
        </div>
      )}
    </div>
  );
}
