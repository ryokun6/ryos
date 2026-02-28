import type { FileSystemItem, PathQueryCache } from "./types";

/** Get parent path of a given path. */
export function getParentPath(path: string): string {
  if (path === "/") return "/";
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return "/"; // Parent of /Documents is /
  return "/" + parts.slice(0, -1).join("/");
}

const pathQueryCache: PathQueryCache = {
  itemsRef: null,
  activeChildrenByParent: new Map(),
  trashedItems: [],
};

/** Rebuild the path query cache from current items. */
export function rebuildPathQueryCache(items: Record<string, FileSystemItem>): void {
  const activeChildrenByParent = new Map<string, FileSystemItem[]>();
  const trashedItems: FileSystemItem[] = [];

  for (const item of Object.values(items)) {
    if (item.status === "trashed") {
      trashedItems.push(item);
      continue;
    }

    if (item.status !== "active" || item.path === "/") {
      continue;
    }

    const parentPath = getParentPath(item.path);
    const existingBucket = activeChildrenByParent.get(parentPath);
    if (existingBucket) {
      existingBucket.push(item);
    } else {
      activeChildrenByParent.set(parentPath, [item]);
    }
  }

  pathQueryCache.itemsRef = items;
  pathQueryCache.activeChildrenByParent = activeChildrenByParent;
  pathQueryCache.trashedItems = trashedItems;
}

/** Ensure cache is up to date for the given items reference. */
export function ensurePathQueryCache(items: Record<string, FileSystemItem>): void {
  if (pathQueryCache.itemsRef !== items) {
    rebuildPathQueryCache(items);
  }
}

/** Get item by path (pure, no cache). */
export function getItem(items: Record<string, FileSystemItem>, path: string): FileSystemItem | undefined {
  return items[path];
}

/**
 * Get items in a path. Call ensurePathQueryCache(items) before using.
 * For /Trash returns trashed items; otherwise returns active children of the path.
 */
export function getItemsInPath(path: string): FileSystemItem[] {
  if (path === "/Trash") {
    return pathQueryCache.trashedItems.slice();
  }
  return (pathQueryCache.activeChildrenByParent.get(path) || []).slice();
}

/**
 * Get all trashed items. Call ensurePathQueryCache(items) before using.
 */
export function getTrashItems(): FileSystemItem[] {
  return pathQueryCache.trashedItems.slice();
}
