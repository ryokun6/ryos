import type { AppInstance } from "@/stores/useAppStore";
import type {
  LiveDesktopSnapshot,
  LiveDesktopWindowSnapshot,
} from "@/api/liveDesktop";

function pickObjectKeys(
  value: unknown,
  allowedKeys: string[]
): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const picked: Record<string, unknown> = {};

  for (const key of allowedKeys) {
    if (source[key] !== undefined) {
      picked[key] = source[key];
    }
  }

  return Object.keys(picked).length > 0 ? picked : undefined;
}

export function sanitizeLiveDesktopInitialData(
  appId: string,
  initialData: unknown
): Record<string, unknown> | undefined {
  switch (appId) {
    case "finder":
      return pickObjectKeys(initialData, ["path"]);
    case "textedit":
      return pickObjectKeys(initialData, ["path"]);
    case "control-panels":
      return pickObjectKeys(initialData, ["defaultTab"]);
    case "internet-explorer":
      return pickObjectKeys(initialData, ["shareCode", "url", "year"]);
    case "ipod":
      return pickObjectKeys(initialData, ["videoId"]);
    case "karaoke":
      return pickObjectKeys(initialData, ["videoId", "listenSessionId"]);
    case "videos":
      return pickObjectKeys(initialData, ["videoId"]);
    case "applet-viewer":
      return pickObjectKeys(initialData, ["path", "shareCode", "icon", "name"]);
    case "terminal":
      return pickObjectKeys(initialData, ["prefillCommand"]);
    case "chats":
      return pickObjectKeys(initialData, ["prefillMessage", "autoSend"]);
    default:
      return undefined;
  }
}

export function serializeLiveDesktopWindow(
  hostInstanceId: string,
  instance: AppInstance
): LiveDesktopWindowSnapshot {
  return {
    hostInstanceId,
    appId: instance.appId,
    title: instance.title,
    isMinimized: Boolean(instance.isMinimized),
    isForeground: Boolean(instance.isForeground),
    position: instance.position,
    size: instance.size,
    initialData: sanitizeLiveDesktopInitialData(instance.appId, instance.initialData),
  };
}

export function serializeLiveDesktopSnapshot(
  instances: Record<string, AppInstance>,
  instanceOrder: string[],
  foregroundInstanceId: string | null
): LiveDesktopSnapshot {
  const windows: LiveDesktopWindowSnapshot[] = instanceOrder
    .map((instanceId) => {
      const instance = instances[instanceId];
      if (!instance || !instance.isOpen) return null;
      return serializeLiveDesktopWindow(instanceId, instance);
    })
    .filter((value): value is LiveDesktopWindowSnapshot => value !== null);

  return {
    windows,
    foregroundHostInstanceId: foregroundInstanceId,
    timestamp: Date.now(),
  };
}
