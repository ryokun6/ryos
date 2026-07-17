export const SIDEBAR_HIDDEN_FOLDERS = new Set(["/Trash", "/Sites"]);

// Explicit sidebar folder order; any visible folders not listed here keep their
// natural order after these, and Desktop is always last.
export const SIDEBAR_FOLDER_ORDER = [
  "/Applications",
  "/Applets",
  "/Documents",
  "/Images",
  "/Music",
  "/Videos",
  "/Books",
];

export const SIDEBAR_LAST_FOLDER = "/Desktop";

export interface SidebarPlaceFolder {
  name: string;
  path: string;
  icon: string;
}

/**
 * Sort visible root folders for the Finder sidebar.
 * Known folders follow SIDEBAR_FOLDER_ORDER; other folders keep relative
 * order after them; Desktop is always last.
 */
export function orderSidebarRootFolders<T extends { path: string }>(
  folders: T[]
): T[] {
  const visible = folders.filter((f) => !SIDEBAR_HIDDEN_FOLDERS.has(f.path));

  const orderRank = (path: string) => {
    if (path === SIDEBAR_LAST_FOLDER) {
      return Number.MAX_SAFE_INTEGER;
    }
    const i = SIDEBAR_FOLDER_ORDER.indexOf(path);
    // Unlisted folders (except Desktop) sit just before Desktop.
    return i === -1 ? Number.MAX_SAFE_INTEGER - 1 : i;
  };

  return visible.toSorted(
    (a, b) => orderRank(a.path) - orderRank(b.path)
  );
}
