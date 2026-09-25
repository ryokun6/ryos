/**
 * Overflow-menu Home / Work actions for a place card.
 *
 * Each slot shows either Set or Unset, never both:
 * - Occupied by this place → Unset (clears the slot)
 * - Otherwise → Set (assigns / replaces that slot)
 */
export type PlaceHomeWorkMenuItem =
  | "setHome"
  | "setWork"
  | "unsetHome"
  | "unsetWork";

export function getPlaceHomeWorkMenuItems(options: {
  isHome: boolean;
  isWork: boolean;
}): PlaceHomeWorkMenuItem[] {
  return [
    options.isHome ? "unsetHome" : "setHome",
    options.isWork ? "unsetWork" : "setWork",
  ];
}
