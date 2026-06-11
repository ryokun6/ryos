import type { AppInstance } from "@/stores/useAppStore";

/**
 * Signature-keyed snapshot of the instances map for shell chrome (Dock,
 * Windows taskbar). Geometry/focus writes mutate the `instances` record
 * identity without changing anything the chrome renders; selecting the
 * signature string (cheap to compare) and rebuilding the snapshot only when
 * it changes keeps these components out of high-frequency render paths.
 */
export type DockInstanceSnapshot = Pick<
  AppInstance,
  | "appId"
  | "createdAt"
  | "displayTitle"
  | "initialData"
  | "instanceId"
  | "isLoading"
  | "isMinimized"
  | "isOpen"
  | "title"
>;

function getAppletInitialDataSignature(initialData: unknown): string {
  if (!initialData || typeof initialData !== "object") return "";
  const data = initialData as {
    icon?: unknown;
    name?: unknown;
    path?: unknown;
    shareCode?: unknown;
  };
  return [
    data.path,
    data.shareCode,
    data.icon,
    data.name,
  ]
    .map((value) => (typeof value === "string" ? value : ""))
    .join("\u001f");
}

export function getDockInstancesSignature(
  instances: Record<string, AppInstance>
) {
  return Object.values(instances)
    .map((inst) =>
      [
        inst.instanceId,
        inst.appId,
        inst.isOpen ? "1" : "0",
        inst.isLoading ? "1" : "0",
        inst.isMinimized ? "1" : "0",
        inst.createdAt,
        inst.title ?? "",
        inst.displayTitle ?? "",
        inst.appId === "applet-viewer"
          ? getAppletInitialDataSignature(inst.initialData)
          : "",
      ].join("\u001f")
    )
    .join("\u001e");
}

export function getDockInstancesSnapshot(
  instances: Record<string, AppInstance>
): Record<string, AppInstance> {
  return Object.fromEntries(
    Object.entries(instances).map(([id, inst]) => {
      const snapshot = {
        appId: inst.appId,
        createdAt: inst.createdAt,
        displayTitle: inst.displayTitle,
        initialData: inst.initialData,
        instanceId: inst.instanceId,
        isLoading: inst.isLoading,
        isMinimized: inst.isMinimized,
        isOpen: inst.isOpen,
        title: inst.title,
      } satisfies DockInstanceSnapshot;
      return [id, snapshot as AppInstance];
    })
  );
}
