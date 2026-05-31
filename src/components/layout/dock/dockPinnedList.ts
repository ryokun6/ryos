import { resolveAppId, type AppId } from "@/config/appRegistryData";
import type { DockItem } from "@/stores/useDockStore";

/**
 * Return pinned dock items that can be rendered safely.
 *
 * Persisted dock state may contain stale app ids from old localStorage/cloud
 * sync, so normalize known legacy ids and drop unknown app entries before icon
 * lookup.
 */
export function computeDockPinnedItems(pinnedItems: DockItem[]): DockItem[] {
  const seenAppIds = new Set<AppId>();
  const items: DockItem[] = [];

  for (const item of pinnedItems) {
    if (item.type !== "app") {
      items.push(item);
      continue;
    }

    const appId = resolveAppId(item.id);
    if (!appId || seenAppIds.has(appId)) {
      continue;
    }

    seenAppIds.add(appId);
    items.push(appId === item.id ? item : { ...item, id: appId });
  }

  return items;
}
