import { useTranslation } from "react-i18next";
import { motion, AnimatePresence, type Transition } from "motion/react";
import {
  Bicycle,
  Briefcase,
  DotsThree,
  House,
  NavigationArrow,
  Star,
  X,
} from "@phosphor-icons/react";
import { isInTaiwan } from "../youbike/geo";
import { isYouBikePlace } from "../youbike/place";
import { cn } from "@/lib/utils";
import {
  AQUA_ICON_BUTTON_PADDING_CLASS,
  AQUA_ICON_BUTTON_PHOSPHOR_SIZE,
  AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT,
  AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT_ACTIVE,
} from "@/lib/aquaIconButton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  osCardClassName,
  osSubtleIconButtonClassName,
} from "@/components/shared/osThemePrimitives";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import {
  getPoiVisual,
  poiVisualGradient,
  poiVisualWithIcon,
} from "../utils/poiVisuals";
import {
  HOME_SAVED_VISUAL,
  WORK_SAVED_VISUAL,
} from "../utils/savedPlaceVisuals";
import { getPlaceHomeWorkMenuItems } from "../utils/homeWorkMenu";
import type { SavedPlace } from "../utils/types";

export interface MapsPlaceCardProps {
  place: SavedPlace | null;
  isFavorite: boolean;
  isHome: boolean;
  isWork: boolean;
  onSetHome: (place: SavedPlace) => void;
  onSetWork: (place: SavedPlace) => void;
  onUnsetHome: () => void;
  onUnsetWork: () => void;
  onToggleFavorite: (place: SavedPlace) => void;
  onDirections: (place: SavedPlace) => void;
  onYouBikeDirections?: (place: SavedPlace) => void;
  onClose: () => void;
}

// Spring tuned to feel close to the existing drawer transition but a touch
// snappier — the card is small and benefits from a quicker settle.
const CARD_TRANSITION: Transition = {
  type: "spring",
  stiffness: 360,
  damping: 30,
  mass: 0.7,
};

/**
 * Convert a MapKit `pointOfInterestCategory` (camelCase, sometimes prefixed
 * with `MKPOICategory`) into a localized human-friendly label.
 *
 * Looks up `apps.maps.poiCategory.<key>` first (where `<key>` is the
 * normalized camelCase form, matching `getPoiVisual`), and falls back to a
 * camelCase -> Title Case humanization when no translation key exists.
 *
 * Examples:
 *   "foodMarket"              -> t("…poiCategory.foodMarket") ?? "Food Market"
 *   "MKPOICategoryRestaurant" -> t("…poiCategory.restaurant")
 *   "evCharger"               -> t("…poiCategory.evCharger")  ?? "Ev Charger"
 */
function humanizeCategory(
  category: string | null | undefined,
  t: ReturnType<typeof useTranslation>["t"]
): string | null {
  if (!category) return null;
  const stripped = category.replace(/^MKPOICategory/, "");
  if (!stripped) return null;
  const key = stripped.charAt(0).toLowerCase() + stripped.slice(1);
  const fallback =
    stripped
      // insert a space before each uppercase that follows a lowercase/number
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      // collapse runs of caps (e.g. "EVCharger" -> "EV Charger")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  const titleCased = fallback.charAt(0).toUpperCase() + fallback.slice(1);
  return t(`apps.maps.poiCategory.${key}`, { defaultValue: titleCased });
}

export function MapsPlaceCard({
  place,
  isFavorite,
  isHome,
  isWork,
  onSetHome,
  onSetWork,
  onUnsetHome,
  onUnsetWork,
  onToggleFavorite,
  onDirections,
  onYouBikeDirections,
  onClose,
}: MapsPlaceCardProps) {
  const { t } = useTranslation();
  const { isMacOSTheme, isWindowsTheme, isSystem7Theme, isWin98 } = useThemeFlags();

  return (
    <AnimatePresence>
      {place && (
        <motion.div
          key={place.id}
          role="region"
          aria-label={t("apps.maps.placeCard.regionLabel", {
            defaultValue: "Selected place",
          })}
          className="pointer-events-auto relative w-full min-w-0 select-none"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={CARD_TRANSITION}
        >
          <div
            className={cn(
              osCardClassName(
                { isMacOSTheme, isSystem7Theme, isWindowsTheme, isWin98 },
                { embed: "panel" }
              ),
              "gap-2.5 p-3",
              isWindowsTheme && "shadow-md"
            )}
          >
            <PlaceCardHeader
              place={place}
              isHome={isHome}
              isWork={isWork}
              onClose={onClose}
              t={t}
            />
            <PlaceCardActions
              place={place}
              isFavorite={isFavorite}
              isHome={isHome}
              isWork={isWork}
              onSetHome={onSetHome}
              onSetWork={onSetWork}
              onUnsetHome={onUnsetHome}
              onUnsetWork={onUnsetWork}
              onToggleFavorite={onToggleFavorite}
              onDirections={onDirections}
              onYouBikeDirections={onYouBikeDirections}
              t={t}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface PlaceCardHeaderProps {
  place: SavedPlace;
  isHome: boolean;
  isWork: boolean;
  onClose: () => void;
  t: ReturnType<typeof useTranslation>["t"];
}

function PlaceCardHeader({
  place,
  isHome,
  isWork,
  onClose,
  t,
}: PlaceCardHeaderProps) {
  const homeTitle = t("apps.maps.places.home", { defaultValue: "Home" });
  const workTitle = t("apps.maps.places.work", { defaultValue: "Work" });

  const titleOverride = isHome
    ? homeTitle
    : isWork
      ? workTitle
      : undefined;

  const visual = isHome
    ? poiVisualWithIcon(HOME_SAVED_VISUAL)
    : isWork
      ? poiVisualWithIcon(WORK_SAVED_VISUAL)
      : getPoiVisual(place.category);
  const Icon = visual.Icon;
  const categoryLabel =
    titleOverride == null ? humanizeCategory(place.category, t) : null;

  const title = titleOverride ?? place.name;
  const subtitle = titleOverride
    ? place.subtitle || place.name
    : place.subtitle;

  return (
    <div className="flex items-start gap-2.5">
      <div
        className="aqua-icon-badge flex size-9 shrink-0 items-center justify-center text-white"
        style={{ backgroundImage: poiVisualGradient(visual) }}
        aria-hidden="true"
      >
        <Icon size={20} weight="fill" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <div className="truncate text-[13px] font-semibold leading-tight text-os-text-primary">
            {title}
          </div>
          {categoryLabel && (
            <div className="shrink-0 text-[11px] leading-tight text-os-text-secondary">
              {categoryLabel}
            </div>
          )}
        </div>
        {subtitle && (
          <div className="line-clamp-2 text-[11px] leading-snug text-os-text-secondary">
            {subtitle}
          </div>
        )}
        {place.youbike && (
          <div className="mt-0.5 text-[11px] leading-snug text-os-text-secondary">
            {place.youbike.isActive
              ? t("apps.maps.youbike.availability", {
                  defaultValue: "{{bikes}} bikes · {{docks}} docks",
                  bikes: place.youbike.bikesAvailable,
                  docks: place.youbike.docksAvailable,
                })
              : t("apps.maps.youbike.inactive", {
                  defaultValue: "Station closed",
                })}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className={cn(
          "shrink-0 -mr-0.5 -mt-0.5 flex size-6 items-center justify-center rounded-full",
          "focus:outline-none focus-visible:ring-1",
          osSubtleIconButtonClassName()
        )}
        aria-label={t("apps.maps.placeCard.close", {
          defaultValue: "Close place card",
        })}
      >
        <X size={12} weight="bold" />
      </button>
    </div>
  );
}

interface PlaceCardActionsProps {
  place: SavedPlace;
  isFavorite: boolean;
  isHome: boolean;
  isWork: boolean;
  onSetHome: (place: SavedPlace) => void;
  onSetWork: (place: SavedPlace) => void;
  onUnsetHome: () => void;
  onUnsetWork: () => void;
  onToggleFavorite: (place: SavedPlace) => void;
  onDirections: (place: SavedPlace) => void;
  onYouBikeDirections?: (place: SavedPlace) => void;
  t: ReturnType<typeof useTranslation>["t"];
}

function PlaceCardActions({
  place,
  isFavorite,
  isHome,
  isWork,
  onSetHome,
  onSetWork,
  onUnsetHome,
  onUnsetWork,
  onToggleFavorite,
  onDirections,
  onYouBikeDirections,
  t,
}: PlaceCardActionsProps) {
  const { isMacOSTheme } = useThemeFlags();
  const variant = isMacOSTheme ? "aqua" : "retro";
  const showYouBike =
    !!onYouBikeDirections &&
    (isYouBikePlace(place) ||
      isInTaiwan({ latitude: place.latitude, longitude: place.longitude }));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        type="button"
        variant={variant}
        size="sm"
        onClick={() => onDirections(place)}
        title={t("apps.maps.placeCard.openDirections", {
          defaultValue: "Get directions in Apple Maps",
        })}
        className={AQUA_ICON_BUTTON_PADDING_CLASS}
      >
        <NavigationArrow
          size={AQUA_ICON_BUTTON_PHOSPHOR_SIZE}
          weight={AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT}
        />
        <span>
          {t("apps.maps.placeCard.directions", {
            defaultValue: "Directions",
          })}
        </span>
      </Button>

      {showYouBike && (
        <Button
          type="button"
          variant={variant}
          size="sm"
          onClick={() => onYouBikeDirections?.(place)}
          title={t("apps.maps.youbike.directionsTitle", {
            defaultValue: "Directions via YouBike",
          })}
          className={AQUA_ICON_BUTTON_PADDING_CLASS}
        >
          <Bicycle
            size={AQUA_ICON_BUTTON_PHOSPHOR_SIZE}
            weight={AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT}
          />
          <span>
            {t("apps.maps.youbike.directions", {
              defaultValue: "YouBike",
            })}
          </span>
        </Button>
      )}

      <PlaceCardMoreMenu
        place={place}
        isFavorite={isFavorite}
        isHome={isHome}
        isWork={isWork}
        onSetHome={onSetHome}
        onSetWork={onSetWork}
        onUnsetHome={onUnsetHome}
        onUnsetWork={onUnsetWork}
        onToggleFavorite={onToggleFavorite}
        t={t}
      />
    </div>
  );
}

function PlaceCardMoreMenu({
  place,
  isFavorite,
  isHome,
  isWork,
  onSetHome,
  onSetWork,
  onUnsetHome,
  onUnsetWork,
  onToggleFavorite,
  t,
}: {
  place: SavedPlace;
  isFavorite: boolean;
  isHome: boolean;
  isWork: boolean;
  onSetHome: (place: SavedPlace) => void;
  onSetWork: (place: SavedPlace) => void;
  onUnsetHome: () => void;
  onUnsetWork: () => void;
  onToggleFavorite: (place: SavedPlace) => void;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const { isMacOSTheme } = useThemeFlags();
  const favoriteLabel = isFavorite
    ? t("apps.maps.placeCard.favorited", { defaultValue: "Favorited" })
    : t("apps.maps.placeCard.favorite", { defaultValue: "Favorite" });
  const homeWorkItems = getPlaceHomeWorkMenuItems({ isHome, isWork });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={t("apps.maps.placeCard.moreActions", { defaultValue: "More" })}
          aria-label={t("apps.maps.placeCard.moreActions", {
            defaultValue: "More",
          })}
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-full p-0",
            "focus:outline-none focus-visible:ring-1",
            isMacOSTheme
              ? "aqua-button secondary !h-7 !w-7 !min-h-7 !min-w-7 !rounded-full !p-0"
              : "border border-os-button-shadow bg-os-button-face text-os-text-primary active:bg-os-button-activeFace"
          )}
        >
          <DotsThree size={18} weight="bold" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start">
        <DropdownMenuItem onSelect={() => onToggleFavorite(place)}>
          <Star
            weight={
              isFavorite
                ? AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT_ACTIVE
                : AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT
            }
          />
          {favoriteLabel}
        </DropdownMenuItem>
        {homeWorkItems.map((item) => {
          if (item === "setHome") {
            return (
              <DropdownMenuItem
                key={item}
                aria-pressed={isHome}
                onSelect={() => onSetHome(place)}
              >
                <House
                  weight={
                    isHome
                      ? AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT_ACTIVE
                      : AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT
                  }
                />
                {t("apps.maps.placeCard.setHome", {
                  defaultValue: "Set as Home",
                })}
              </DropdownMenuItem>
            );
          }
          if (item === "setWork") {
            return (
              <DropdownMenuItem
                key={item}
                aria-pressed={isWork}
                onSelect={() => onSetWork(place)}
              >
                <Briefcase
                  weight={
                    isWork
                      ? AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT_ACTIVE
                      : AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT
                  }
                />
                {t("apps.maps.placeCard.setWork", {
                  defaultValue: "Set as Work",
                })}
              </DropdownMenuItem>
            );
          }
          if (item === "unsetHome") {
            return (
              <DropdownMenuItem key={item} onSelect={onUnsetHome}>
                <House weight={AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT} />
                {t("apps.maps.placeCard.unsetHome", {
                  defaultValue: "Unset Home",
                })}
              </DropdownMenuItem>
            );
          }
          return (
            <DropdownMenuItem key={item} onSelect={onUnsetWork}>
              <Briefcase weight={AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT} />
              {t("apps.maps.placeCard.unsetWork", {
                defaultValue: "Unset Work",
              })}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
