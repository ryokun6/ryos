import type { CSSProperties } from "react";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import {
  CONTROL_PANEL_CATEGORIES,
  CONTROL_PANEL_SECTIONS,
  type ControlPanelPaneId,
} from "./controlPanelsCategories";

export type ControlPanelsCategoryGridProps = {
  t: (key: string) => string;
  onSelect: (paneId: ControlPanelPaneId) => void;
};

export function ControlPanelsCategoryGrid({
  t,
  onSelect,
}: ControlPanelsCategoryGridProps) {
  const visibleSections = CONTROL_PANEL_SECTIONS.map((section) => {
    const categories = section.paneIds
      .map((paneId) =>
        CONTROL_PANEL_CATEGORIES.find((category) => category.id === paneId)
      )
      .filter((category): category is NonNullable<typeof category> => !!category);

    return { section, categories };
  }).filter(({ categories }) => categories.length > 0);

  return (
    <div className="control-panels-category-grid" role="list">
      {visibleSections.map(({ section, categories }) => (
        <section
          key={section.id}
          className="control-panels-section"
          aria-label={t(section.labelKey)}
        >
          <h3 className="control-panels-section-header">{t(section.labelKey)}</h3>
          <div
            className="control-panels-section-grid"
            style={
              {
                "--control-panels-section-cols": categories.length,
              } as CSSProperties
            }
          >
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                role="listitem"
                className="control-panels-category-item p-0"
                onClick={() => onSelect(category.id)}
              >
                <span className="control-panels-category-icon-shell">
                  <ThemedIcon
                    name={category.icon}
                    alt={t(category.labelKey)}
                    className="control-panels-category-icon"
                    draggable={false}
                  />
                </span>
                <span className="control-panels-category-label font-geneva-12">
                  {t(category.labelKey)}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
