import type { AppId } from "@/config/appRegistry";
import { BASE_Z_INDEX } from "./constants";

export function getZIndexForInstance(
  instanceId: string,
  instanceOrder: string[]
): number {
  const index = instanceOrder.indexOf(instanceId);
  if (index === -1) return BASE_Z_INDEX;
  return BASE_Z_INDEX + index + 1;
}

export function supportsMultiWindowApp(appId: AppId): boolean {
  return (
    appId === "textedit" ||
    appId === "finder" ||
    appId === "preview" ||
    appId === "applet-viewer"
  );
}
