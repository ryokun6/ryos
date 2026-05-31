import { getSectionKey } from "./spotlightSectionUtils";
import { SpotlightResultIcon } from "./SpotlightResultIcon";
import type { SpotlightSearchViewModel } from "./useSpotlightSearchController";

type SpotlightResultsTwoColumnProps = {
  vm: SpotlightSearchViewModel;
};

export function SpotlightResultsTwoColumn({ vm }: SpotlightResultsTwoColumnProps) {
  const {
    t,
    listRef,
    groupedResults,
    selectedIndex,
    setSelectedIndex,
    reset,
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
    <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: "320px" }}>
      <table
        className="w-full border-collapse"
        style={{ fontFamily, tableLayout: "fixed" }}
      >
        <colgroup>
          <col style={{ width: "120px" }} />
          <col />
        </colgroup>
        <tbody>
          <tr>
            <td
              style={{
                height: "4px",
                padding: 0,
                borderRight: "1px solid rgba(0,0,0,0.1)",
              }}
            />
            <td
              style={{ height: "4px", padding: 0, background: "rgba(0,0,0,0.04)" }}
            />
          </tr>
          {groupedResults.flatMap((group, groupIdx) => {
            const rows: React.ReactNode[] = [];
            const sectionLabel = t(
              group.items[0]?.sectionLabel || getSectionKey(group.type)
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
                    background: isSelected ? getSelectedBg() : "transparent",
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
                      data-selected={isSelected ? true : undefined}
                      style={{
                        padding: `${rowPy} 10px`,
                        background: "transparent",
                        color: isSelected ? getSelectedTextColor() : undefined,
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
                      onMouseEnter={() => setSelectedIndex(result.globalIndex)}
                    >
                      <SpotlightResultIcon result={result} iconPx={iconPx} />
                      <span className="truncate">
                        {result.title}
                        {result.subtitle &&
                          result.type !== "ai" &&
                          result.subtitle !== sectionLabel && (
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
                  </td>
                </tr>
              );
            });
            return rows;
          })}
          <tr>
            <td
              style={{
                height: "4px",
                padding: 0,
                borderRight: "1px solid rgba(0,0,0,0.1)",
              }}
            />
            <td
              style={{ height: "4px", padding: 0, background: "rgba(0,0,0,0.04)" }}
            />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
