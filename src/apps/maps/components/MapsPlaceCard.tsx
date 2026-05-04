import { useTranslation } from "react-i18next";
import { motion, AnimatePresence, type Transition } from "framer-motion";
import { Briefcase, House, Star, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  AQUA_ICON_BUTTON_PADDING_CLASS,
  AQUA_ICON_BUTTON_PHOSPHOR_SIZE,
} from "@/lib/aquaIconButton";
import { Button } from "@/components/ui/button";
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
import type { SavedPlace } from "../utils/types";

export interface MapsPlaceCardProps {
  place: SavedPlace | null;
  isFavorite: boolean;
  isHome: boolean;
  isWork: boolean;
  onSetHome: (place: SavedPlace) => void;
  onSetWork: (place: SavedPlace) => void;
  onToggleFavorite: (place: SavedPlace) => void;
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
  onToggleFavorite,
  onClose,
}: MapsPlaceCardProps) {
  const { t } = useTranslation();
  const { isMacOSTheme, isXpTheme, isSystem7Theme } = useThemeFlags();

  return (
    <AnimatePresence>
      {place && (
        <motion.div
          key={place.id}
          role="region"
          aria-label={t("apps.maps.placeCard.regionLabel", {
            defaultValue: "Selected place",
          })}
          className={cn(
            "pointer-events-auto absolute select-none",
            // Hug the map edges — 6 px on every side. The earlier 8/12 px
            // insets left a visible band of map peeking around the card; a
            // smaller, uniform gutter feels closer to the system Maps app
            // and gives the card more horizontal room on narrow windows.
            "left-1.5 right-1.5 bottom-1.5"
          )}
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={CARD_TRANSITION}
        >
          <div
            className={cn(
              "flex flex-col gap-2.5 p-3",
              // Theme shells — macOS matches the toast/dock pinstripe glass;
              // other themes mirror their drawer panels so the surfaces look
              // like siblings.
              isMacOSTheme &&
                "maps-place-card-aqua rounded-[0.5rem] text-black",
              !isMacOSTheme &&
                isSystem7Theme &&
                "rounded border-2 border-black bg-white text-black shadow-[2px_2px_0_0_rgba(0,0,0,0.5)]",
              !isMacOSTheme &&
                !isSystem7Theme &&
                isXpTheme &&
                "rounded-[0.4rem] border-2 border-[#0054E3] bg-[#ECE9D8] text-black shadow-md",
              // Fallback (any future theme): neutral light card.
              !isMacOSTheme && !isSystem7Theme && !isXpTheme &&
                "rounded border border-black/30 bg-white text-black shadow-md"
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
              onToggleFavorite={onToggleFavorite}
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
        className="aqua-icon-badge flex h-9 w-9 shrink-0 items-center justify-center text-white"
        style={{ backgroundImage: poiVisualGradient(visual) }}
        aria-hidden="true"
      >
        <Icon size={20} weight="fill" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <div className="truncate text-[13px] font-semibold leading-tight text-black">
            {title}
          </div>
          {categoryLabel && (
            <div className="shrink-0 text-[11px] leading-tight text-black/45">
              {categoryLabel}
            </div>
          )}
        </div>
        {subtitle && (
          <div className="line-clamp-2 text-[11px] leading-snug text-black/60">
            {subtitle}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className={cn(
          "shrink-0 -mr-0.5 -mt-0.5 flex h-6 w-6 items-center justify-center rounded-full",
          "text-black/55 hover:bg-black/10 hover:text-black/85",
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-black/30"
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
  onToggleFavorite: (place: SavedPlace) => void;
  t: ReturnType<typeof useTranslation>["t"];
}

function PlaceCardActions({
  place,
  isFavorite,
  isHome,
  isWork,
  onSetHome,
  onSetWork,
  onToggleFavorite,
  t,
}: PlaceCardActionsProps) {
  const { isMacOSTheme } = useThemeFlags();
  const variant = isMacOSTheme ? "aqua" : "retro";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        type="button"
        variant={variant}
        size="sm"
        onClick={() => onToggleFavorite(place)}
        aria-pressed={isFavorite}
        title={
          isFavorite
            ? t("apps.maps.placeCard.removeFavorite", {
                defaultValue: "Remove from Favorites",
              })
            : t("apps.maps.placeCard.addFavorite", {
                defaultValue: "Add to Favorites",
              })
        }
        className={AQUA_ICON_BUTTON_PADDING_CLASS}
      >
        <Star
          size={AQUA_ICON_BUTTON_PHOSPHOR_SIZE}
          weight={isFavorite ? "fill" : "regular"}
        />
        <span>
          {isFavorite
            ? t("apps.maps.placeCard.favorited", {
                defaultValue: "Favorited",
              })
            : t("apps.maps.placeCard.favorite", {
                defaultValue: "Favorite",
              })}
        </span>
      </Button>

      <Button
        type="button"
        variant={variant}
        size="sm"
        onClick={() => onSetHome(place)}
        aria-pressed={isHome}
        title={t("apps.maps.placeCard.setHome", {
          defaultValue: "Set as Home",
        })}
        className={AQUA_ICON_BUTTON_PADDING_CLASS}
      >
        <House
          size={AQUA_ICON_BUTTON_PHOSPHOR_SIZE}
          weight={isHome ? "fill" : "regular"}
        />
        <span>
          {isHome
            ? t("apps.maps.placeCard.home", { defaultValue: "Home" })
            : t("apps.maps.placeCard.setHome", {
                defaultValue: "Set as Home",
              })}
        </span>
      </Button>

      <Button
        type="button"
        variant={variant}
        size="sm"
        onClick={() => onSetWork(place)}
        aria-pressed={isWork}
        title={t("apps.maps.placeCard.setWork", {
          defaultValue: "Set as Work",
        })}
        className={AQUA_ICON_BUTTON_PADDING_CLASS}
      >
        <Briefcase
          size={AQUA_ICON_BUTTON_PHOSPHOR_SIZE}
          weight={isWork ? "fill" : "regular"}
        />
        <span>
          {isWork
            ? t("apps.maps.placeCard.work", { defaultValue: "Work" })
            : t("apps.maps.placeCard.setWork", {
                defaultValue: "Set as Work",
              })}
        </span>
      </Button>
    </div>
  );
}
