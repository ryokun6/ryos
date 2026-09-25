/**
 * Overflow-menu Home / Work actions for a place card.
 *
 * "Set as Home" and "Set as Work" are always offered so the user can
 * replace a previous assignment from any place. Unset appears only when
 * this place currently occupies that slot.
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
  const items: PlaceHomeWorkMenuItem[] = ["setHome", "setWork"];
  if (options.isHome) items.push("unsetHome");
  if (options.isWork) items.push("unsetWork");
  return items;
}
