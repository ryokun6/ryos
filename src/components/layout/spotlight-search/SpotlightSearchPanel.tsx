import { SpotlightSearchInput } from "./SpotlightSearchInput";
import { SpotlightResultsTwoColumn } from "./SpotlightResultsTwoColumn";
import { SpotlightResultsSingleColumn } from "./SpotlightResultsSingleColumn";
import type { SpotlightSearchViewModel } from "./useSpotlightSearchController";

type SpotlightSearchPanelProps = {
  vm: SpotlightSearchViewModel;
};

export function SpotlightSearchPanel({ vm }: SpotlightSearchPanelProps) {
  const {
    results,
    query,
    isSearching,
    isMacOSTheme,
    isSystem7,
    isMac,
    containerStyles,
    fontFamily,
    fontSize,
    useTwoColumn,
    t,
  } = vm;

  return (
    <div
      style={{ ...containerStyles, fontFamily }}
      className="overflow-hidden spotlight-panel"
    >
      <SpotlightSearchInput vm={vm} />

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
          <SpotlightResultsTwoColumn vm={vm} />
        ) : (
          <SpotlightResultsSingleColumn vm={vm} />
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
          {t("spotlight.noResults")}
        </div>
      )}
    </div>
  );
}
