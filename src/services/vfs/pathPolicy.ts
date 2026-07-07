/**
 * VFS Path Policy
 *
 * Single source of truth for which paths in the virtual file system are
 * writable, which roots are system-managed (protected from rename/trash),
 * and which names are reserved at the root level.
 *
 * Terminology:
 * - "Virtual roots" are computed listings backed by other stores
 *   (app registry, iPod/Videos libraries, IE favorites) — never writable.
 * - "System roots" are the default folders seeded from filesystem.json —
 *   they cannot be renamed or trashed, but some of them are writable inside.
 * - "User roots" are root-level folders created by the user — fully
 *   writable, renamable, and trashable.
 */

/** Roots whose listings are computed from other stores (never writable). */
export const VIRTUAL_ROOTS = [
  "/Applications",
  "/Music",
  "/Videos",
  "/Sites",
] as const;

/** Special roots with dedicated semantics (never general-purpose writable). */
export const SPECIAL_ROOTS = ["/Trash", "/Desktop"] as const;

/** All roots seeded by default (filesystem.json + required /Downloads). */
export const SYSTEM_ROOTS = [
  "/Applications",
  "/Documents",
  "/Downloads",
  "/Images",
  "/Books",
  "/Music",
  "/Videos",
  "/Sites",
  "/Applets",
  "/Trash",
  "/Desktop",
] as const;

/** Legacy virtual root still handled by Finder's loadFiles. */
const LEGACY_ROOTS = ["/Favorites"] as const;

const NON_WRITABLE_ROOTS = new Set<string>([
  ...VIRTUAL_ROOTS,
  ...SPECIAL_ROOTS,
  ...LEGACY_ROOTS,
  // Applets are import-only (managed by the Applet Viewer / Finder import).
  "/Applets",
]);

const SYSTEM_ROOT_SET = new Set<string>(SYSTEM_ROOTS);

const RESERVED_ROOT_NAMES = new Set<string>(
  [...SYSTEM_ROOTS, ...LEGACY_ROOTS].map((path) =>
    path.slice(1).toLowerCase()
  )
);

/** Return the top-level root segment of a path (e.g. "/Docs/a.md" -> "/Docs"). */
export function getRootSegment(path: string): string | null {
  if (!path.startsWith("/") || path === "/") return null;
  const secondSlash = path.indexOf("/", 1);
  return secondSlash === -1 ? path : path.slice(0, secondSlash);
}

/**
 * Whether files/folders can be created, moved, renamed, or imported at the
 * given directory path. True for the root itself (creating new root folders
 * and root-level files), the writable system subtrees, and any user-created
 * root folder subtree.
 */
export function isWritablePath(path: string): boolean {
  if (!path.startsWith("/")) return false;
  if (path === "/") return true;
  const root = getRootSegment(path);
  if (!root) return false;
  return !NON_WRITABLE_ROOTS.has(root);
}

/** Whether a path is a system-managed root that cannot be renamed or trashed. */
export function isProtectedSystemPath(path: string): boolean {
  return path === "/" || SYSTEM_ROOT_SET.has(path);
}

/**
 * Whether content for a file at this path can live in the IndexedDB content
 * stores. Virtual/special subtrees have no user content; everything else
 * routes by path prefix or extension (see getStoreForFile).
 */
export function canPathHaveContent(path: string): boolean {
  if (!path.startsWith("/") || path === "/") return false;
  const root = getRootSegment(path);
  if (!root) return false;
  return !NON_WRITABLE_ROOTS.has(root);
}

export interface WritableDirectoryEntry {
  path: string;
  name: string;
  depth: number;
}

interface DirectoryLikeItem {
  path: string;
  name: string;
  isDirectory: boolean;
  status?: string;
}

/**
 * List all writable directories depth-first (an indented tree), given the
 * files-store items map. Used by save-location pickers.
 */
export function listWritableDirectories(
  items: Record<string, DirectoryLikeItem>
): WritableDirectoryEntry[] {
  const result: WritableDirectoryEntry[] = [];
  const directories = Object.values(items).filter(
    (item) =>
      item.isDirectory &&
      item.status !== "trashed" &&
      // The root "/" is its own parent; exclude it so the walk terminates.
      item.path !== "/"
  );

  const parentOf = (path: string): string => {
    const lastSlash = path.lastIndexOf("/");
    return lastSlash <= 0 ? "/" : path.substring(0, lastSlash);
  };

  const walk = (parent: string, depth: number) => {
    const children = directories
      .filter((item) => parentOf(item.path) === parent)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      if (!isWritablePath(child.path)) continue;
      result.push({ path: child.path, name: child.name, depth });
      walk(child.path, depth + 1);
    }
  };

  walk("/", 0);
  return result;
}

export type RootFolderNameValidation =
  | { ok: true }
  | { ok: false; reason: "empty" | "invalid" | "reserved" };

/**
 * Validate a new root-level folder name. Rejects empty names, path
 * separators, and names colliding (case-insensitively) with system or
 * virtual roots.
 */
export function validateNewRootFolderName(
  name: string
): RootFolderNameValidation {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (trimmed.includes("/") || trimmed === "." || trimmed === "..") {
    return { ok: false, reason: "invalid" };
  }
  if (RESERVED_ROOT_NAMES.has(trimmed.toLowerCase())) {
    return { ok: false, reason: "reserved" };
  }
  return { ok: true };
}
