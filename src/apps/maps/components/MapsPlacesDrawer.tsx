import { AppDrawer } from "@/components/shared/AppDrawer";
import { cn } from "@/lib/utils";
import {
  getPoiVisual,
  poiVisualGradient,
  poiVisualWithIcon,
  type PoiVisual,
} from "../utils/poiVisuals";
import type { SavedPlace } from "../utils/types";

export type { SavedPlace } from "../utils/types";

export interface MapsPlacesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  home: SavedPlace | null;
  work: SavedPlace | null;
  favorites: SavedPlace[];
  recents: SavedPlace[];
  onSelectPlace: (place: SavedPlace) => void;
  /**
   * Translation function from useTranslation. The drawer keeps its own
   * t() call so the parent component doesn't have to pass through every
   * key — it falls back to the English defaults below.
   */
  t: (key: string, options?: Record<string, unknown>) => string;
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <div className="space-y-1">
      <div className="px-2 pt-1 text-[11px] font-normal text-black/45">
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

interface PlaceRowProps {
  place: SavedPlace;
  onClick: () => void;
  /** Override the auto-derived POI visual (e.g. for Home / Work rows). */
  visualOverride?: PoiVisual;
  /** Override the displayed title (e.g. "Home" / "Work"). */
  titleOverride?: string;
}

function PlaceRow({
  place,
  onClick,
  visualOverride,
  titleOverride,
}: PlaceRowProps) {
  const visual = visualOverride
    ? poiVisualWithIcon(visualOverride)
    : getPoiVisual(place.category);
  const Icon = visual.Icon;
  const title = titleOverride ?? place.name;
  const subtitle = titleOverride
    ? place.subtitle || place.name
    : place.subtitle;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12px]",
        "hover:bg-black/5"
      )}
    >
      <div
        className="aqua-icon-badge flex h-6 w-6 shrink-0 items-center justify-center text-white"
        style={{ backgroundImage: poiVisualGradient(visual) }}
        aria-hidden="true"
      >
        <Icon size={14} weight="fill" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-black">{title}</div>
        {subtitle && (
          <div className="truncate text-[11px] text-black/55">
            {subtitle}
          </div>
        )}
      </div>
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-2 py-1 text-[11px] text-black/50">{message}</div>
  );
}

const HOME_VISUAL: PoiVisual = {
  iconKey: "House",
  from: "#60a5fa",
  to: "#1d4ed8",
};
const WORK_VISUAL: PoiVisual = {
  iconKey: "Briefcase",
  from: "#f59e0b",
  to: "#92400e",
};

export function MapsPlacesDrawer({
  isOpen,
  home,
  work,
  favorites,
  recents,
  onSelectPlace,
  t,
}: MapsPlacesDrawerProps) {
  // Keep the drawer open after a tap so the user can quickly hop between
  // saved places without re-toggling it. The drawer is dismissed only by
  // the search-bar toggle in the parent — `onClose` is intentionally not
  // wired here.
  const handleSelect = (place: SavedPlace) => {
    onSelectPlace(place);
  };

  const hasAny = !!home || !!work || favorites.length > 0 || recents.length > 0;

  return (
    <AppDrawer isOpen={isOpen}>
      <div className="font-os-ui flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-1 pb-2 pt-1">
        {!hasAny && (
          <EmptyState
            message={t("apps.maps.places.allEmpty", {
              defaultValue:
                "Search for a place and use the card actions to save it as Home, Work, or a Favorite.",
            })}
          />
        )}

        {(home || work || favorites.length > 0) && (
          <Section
            title={t("apps.maps.places.favorites", {
              defaultValue: "Favorites",
            })}
          >
            <div className="space-y-0.5">
              {home && (
                <PlaceRow
                  place={home}
                  onClick={() => handleSelect(home)}
                  visualOverride={HOME_VISUAL}
                  titleOverride={t("apps.maps.places.home", {
                    defaultValue: "Home",
                  })}
                />
              )}
              {work && (
                <PlaceRow
                  place={work}
                  onClick={() => handleSelect(work)}
                  visualOverride={WORK_VISUAL}
                  titleOverride={t("apps.maps.places.work", {
                    defaultValue: "Work",
                  })}
                />
              )}
              {favorites.map((place) => (
                <PlaceRow
                  key={place.id}
                  place={place}
                  onClick={() => handleSelect(place)}
                />
              ))}
            </div>
          </Section>
        )}

        {recents.length > 0 && (
          <Section
            title={t("apps.maps.places.recents", {
              defaultValue: "Recent Places",
            })}
          >
            <div className="space-y-0.5">
              {recents.map((place) => (
                <PlaceRow
                  key={place.id}
                  place={place}
                  onClick={() => handleSelect(place)}
                />
              ))}
            </div>
          </Section>
        )}
      </div>
    </AppDrawer>
  );
}
