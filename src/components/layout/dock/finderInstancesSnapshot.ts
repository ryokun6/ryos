import type { FinderInstance } from "@/stores/useFinderStore";

/**
 * Signature-keyed snapshot of Finder instances for shell chrome (Dock).
 * Path/view/selection writes mutate the `instances` record identity without
 * changing anything the dock needs for focus-or-launch routing and context
 * menus; selecting this string keeps the dock out of Finder navigation
 * re-render paths.
 */
export function getFinderInstancesSignature(
  instances: Record<string, FinderInstance>
): string {
  return Object.values(instances)
    .map((inst) =>
      [inst.instanceId, inst.currentPath ?? ""].join("\u001f")
    )
    .join("\u001e");
}

export function getFinderInstancesSnapshot(
  instances: Record<string, FinderInstance>
): Record<string, FinderInstance> {
  return Object.fromEntries(
    Object.entries(instances).map(([id, inst]) => [
      id,
      {
        instanceId: inst.instanceId,
        currentPath: inst.currentPath,
        navigationHistory: inst.navigationHistory,
        navigationIndex: inst.navigationIndex,
        viewType: inst.viewType,
        sortType: inst.sortType,
        selectedFile: inst.selectedFile,
        selectedFiles: inst.selectedFiles,
        selectionAnchorPath: inst.selectionAnchorPath,
      } satisfies FinderInstance,
    ])
  );
}
