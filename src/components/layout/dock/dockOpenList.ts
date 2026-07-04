import type { AppId } from "@/config/appRegistry";
import type { AppInstance } from "@/stores/useAppStore";
import type { DockOpenItem } from "./dockTypes";

// The applet host app renders one dock slot per open instance instead of a
// single grouped slot like every other app.
const APPLET_VIEWER_APP_ID = "applet-viewer";

/**
 * Compute the list of non-pinned open apps/applets shown after the pinned
 * divider in the dock.
 *
 * Every entry returned here MUST resolve to a renderable icon. Entries that
 * cannot be rendered (unknown/stale app ids, or applet instances without a live
 * instance) are dropped so the dock never paints an empty slot — and so the
 * "open apps" divider count stays in sync with what is actually rendered.
 */
export function computeDockOpenItems(
  instances: Record<string, AppInstance>,
  pinnedAppIds: Iterable<AppId>,
  isValidAppId: (appId: AppId) => boolean,
): DockOpenItem[] {
  const pinnedSet =
    pinnedAppIds instanceof Set
      ? pinnedAppIds
      : new Set<AppId>(pinnedAppIds);

  const items: DockOpenItem[] = [];

  // Group open instances by their app id.
  const openByApp: Record<string, AppInstance[]> = {};
  for (const instance of Object.values(instances)) {
    if (!instance || !instance.isOpen) {
      continue;
    }
    const appId = instance.appId;
    if (!appId) {
      continue;
    }
    (openByApp[appId] ??= []).push(instance);
  }

  for (const [appId, instancesList] of Object.entries(openByApp)) {
    if (appId === APPLET_VIEWER_APP_ID) {
      // One slot per applet instance — skip any instance missing an id since it
      // could not be matched back to a live window and would render empty.
      for (const inst of instancesList) {
        if (!inst.instanceId) {
          continue;
        }
        items.push({
          type: "applet",
          appId: inst.appId as AppId,
          instanceId: inst.instanceId,
          sortKey: inst.createdAt || 0,
        });
      }
      continue;
    }

    // Single slot per app — drop unknown/stale ids that have no registry entry
    // (these previously threw in getAppIconPath / rendered a broken slot).
    if (!isValidAppId(appId as AppId)) {
      continue;
    }

    items.push({
      type: "app",
      appId: appId as AppId,
      sortKey: instancesList[0]?.createdAt ?? 0,
    });
  }

  // Stable order by creation time.
  items.sort((a, b) => a.sortKey - b.sortKey);

  // Pinned apps already have a slot on the left; don't duplicate them here.
  return items.filter((item) => !pinnedSet.has(item.appId));
}
