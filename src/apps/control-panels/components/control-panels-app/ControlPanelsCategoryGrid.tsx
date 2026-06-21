import type { CSSProperties } from "react";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { cn } from "@/lib/utils";
import {
  CONTROL_PANEL_CATEGORIES,
  CONTROL_PANEL_SECTIONS,
  type ControlPanelPaneId,
} from "./controlPanelsCategories";

export type ControlPanelsCategoryGridProps = {
  t: (key: string) => string;
  onSelect: (paneId: ControlPanelPaneId) => void;
  /** When true, the grid is in spotlight (search) mode: non-matches dim. */
  spotlightActive?: boolean;
  /** Pane IDs that match the active search query. */
  spotlightPaneIds?: Set<ControlPanelPaneId>;
  /** The currently highlighted result's pane (hover/keyboard) for extra glow. */
  focusedPaneId?: ControlPanelPaneId | null;
};

export function ControlPanelsCategoryGrid({
  t,
  onSelect,
  spotlightActive = false,
  spotlightPaneIds,
  focusedPaneId = null,
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
    <div
      className={cn(
        "control-panels-category-grid",
        spotlightActive && "control-panels-category-grid--searching"
      )}
      role="list"
    >
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
            {categories.map((category) => {
              const isMatch =
                spotlightActive && !!spotlightPaneIds?.has(category.id);
              const isFocused = spotlightActive && focusedPaneId === category.id;
              return (
              <button
                key={category.id}
                type="button"
                role="listitem"
                className={cn(
                  "control-panels-category-item p-0",
                  isMatch && "is-spotlight-match",
                  isFocused && "is-spotlight-focused"
                )}
                onClick={() => onSelect(category.id)}
              >
                <span className="control-panels-category-icon-shell">
                  <ThemedIcon
                    name={category.icon}
                    // The category artwork is the macOS System Preferences icon
                    // set (the only complete set); the unified layout reuses it
                    // across every theme so the grid never falls back to broken
                    // images on System 7 / Windows where these assets are absent.
                    themeOverride="macosx"
                    alt={t(category.labelKey)}
                    className="control-panels-category-icon"
                    draggable={false}
                  />
                </span>
                <span className="control-panels-category-label font-geneva-12">
                  {t(category.labelKey)}
                </span>
              </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
