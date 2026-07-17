import { compareFinderSortText } from "@/utils/finderDisplay";
import { getTranslatedFolderNameFromName } from "@/utils/i18n";

export const SIDEBAR_HIDDEN_FOLDERS = new Set(["/Trash", "/Sites"]);

/** Pinned at the top of Finder places (sidebar + Go menu), in this order. */
export const SIDEBAR_PINNED_FOLDERS = ["/Applications", "/Applets"];

export const SIDEBAR_LAST_FOLDER = "/Desktop";

export interface SidebarPlaceFolder {
  name: string;
  path: string;
  icon: string;
}

function placeSortName(folder: { name: string }): string {
  return getTranslatedFolderNameFromName(folder.name) || folder.name;
}

/**
 * Order root folders for Finder places (sidebar + Go menu):
 * Applications and Applets pinned first, then alphabetical, Desktop last.
 */
export function orderFinderRootFolders<T extends { path: string; name: string }>(
  folders: T[]
): T[] {
  const pinnedRank = (path: string): number | null => {
    const i = SIDEBAR_PINNED_FOLDERS.indexOf(path);
    return i === -1 ? null : i;
  };

  return folders.toSorted((a, b) => {
    const aPinned = pinnedRank(a.path);
    const bPinned = pinnedRank(b.path);
    if (aPinned !== null || bPinned !== null) {
      if (aPinned !== null && bPinned !== null) {
        return aPinned - bPinned;
      }
      return aPinned !== null ? -1 : 1;
    }

    if (a.path === SIDEBAR_LAST_FOLDER) return 1;
    if (b.path === SIDEBAR_LAST_FOLDER) return -1;

    return compareFinderSortText(placeSortName(a), placeSortName(b));
  });
}

/** Visible sidebar places: hide Trash/Sites, then apply Finder places order. */
export function orderSidebarRootFolders<T extends { path: string; name: string }>(
  folders: T[]
): T[] {
  return orderFinderRootFolders(
    folders.filter((f) => !SIDEBAR_HIDDEN_FOLDERS.has(f.path))
  );
}
