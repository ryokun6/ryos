import type { AppId } from "@/config/appRegistryData";

export interface AppLaunchRequest {
  appId: AppId;
  initialPath?: string;
  initialData?: unknown;
}

export interface AppUpdateRequest {
  appId: AppId;
  instanceId?: string;
  initialData?: unknown;
}

export interface ExposeWindowSelectEventDetail {
  instanceId: string;
}

export interface WindowFocusRequest {
  instanceId: string;
}

export interface FileSavedEventDetail {
  name: string;
  path: string;
  content?: string | Blob;
  icon?: string;
}

export interface FileUpdatedEventDetail {
  name: string;
  path: string;
  content?: string;
}

export interface FileRenamedEventDetail {
  oldPath: string;
  newPath: string;
  oldName: string;
  newName: string;
}

export interface DocumentUpdatedEventDetail {
  path: string;
  content: string;
}

export interface AppletUpdatedEventDetail {
  path?: string;
  content?: string;
}

const APP_EVENT_NAMES = {
  launchApp: "launchApp",
  updateApp: "updateApp",
  focusWindow: "focusWindow",
  spotlightToggle: "toggleSpotlight",
  exposeToggle: "toggleExposeView",
  exposeWindowSelect: "exposeWindowSelect",
  fileSaved: "saveFile",
  fileUpdated: "fileUpdated",
  fileRenamed: "fileRenamed",
  documentUpdated: "documentUpdated",
  appletUpdated: "appletUpdated",
} as const;

type AppEventName = keyof typeof APP_EVENT_NAMES;

type AppEventDetailMap = {
  launchApp: AppLaunchRequest;
  updateApp: AppUpdateRequest;
  focusWindow: WindowFocusRequest;
  spotlightToggle: undefined;
  exposeToggle: undefined;
  exposeWindowSelect: ExposeWindowSelectEventDetail;
  fileSaved: FileSavedEventDetail;
  fileUpdated: FileUpdatedEventDetail;
  fileRenamed: FileRenamedEventDetail;
  documentUpdated: DocumentUpdatedEventDetail;
  appletUpdated: AppletUpdatedEventDetail;
};

type AppEventTarget = Pick<EventTarget, "dispatchEvent" | "addEventListener" | "removeEventListener">;

function getDefaultTarget(): AppEventTarget | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window;
}

function emitEvent<K extends AppEventName>(
  name: K,
  detail: AppEventDetailMap[K],
  target: AppEventTarget | null = getDefaultTarget(),
): void {
  if (!target) {
    return;
  }

  if (typeof detail === "undefined") {
    target.dispatchEvent(new CustomEvent(APP_EVENT_NAMES[name]));
    return;
  }

  target.dispatchEvent(
    new CustomEvent(APP_EVENT_NAMES[name], {
      detail,
    }),
  );
}

function subscribeToEvent<K extends AppEventName>(
  name: K,
  handler: (event: CustomEvent<AppEventDetailMap[K]>) => void,
  target: AppEventTarget | null = getDefaultTarget(),
): () => void {
  if (!target) {
    return () => {};
  }

  const listener: EventListener = (event) => {
    handler(event as CustomEvent<AppEventDetailMap[K]>);
  };

  target.addEventListener(APP_EVENT_NAMES[name], listener);

  return () => {
    target.removeEventListener(APP_EVENT_NAMES[name], listener);
  };
}

export function requestAppLaunch(
  detail: AppLaunchRequest,
  target?: AppEventTarget | null,
): void {
  emitEvent("launchApp", detail, target);
}

export function onAppLaunchRequest(
  handler: (event: CustomEvent<AppLaunchRequest>) => void,
  target?: AppEventTarget | null,
): () => void {
  return subscribeToEvent("launchApp", handler, target);
}

export function emitAppUpdate(
  detail: AppUpdateRequest,
  target?: AppEventTarget | null,
): void {
  emitEvent("updateApp", detail, target);
}

export function onAppUpdate(
  handler: (event: CustomEvent<AppUpdateRequest>) => void,
  target?: AppEventTarget | null,
): () => void {
  return subscribeToEvent("updateApp", handler, target);
}

export function requestWindowFocus(
  detail: WindowFocusRequest,
  target?: AppEventTarget | null,
): void {
  emitEvent("focusWindow", detail, target);
}

export function onWindowFocusRequest(
  handler: (event: CustomEvent<WindowFocusRequest>) => void,
  target?: AppEventTarget | null,
): () => void {
  return subscribeToEvent("focusWindow", handler, target);
}

export function toggleSpotlightSearch(target?: AppEventTarget | null): void {
  emitEvent("spotlightToggle", undefined, target);
}

export function onSpotlightToggle(
  handler: () => void,
  target?: AppEventTarget | null,
): () => void {
  return subscribeToEvent(
    "spotlightToggle",
    () => {
      handler();
    },
    target,
  );
}

export function toggleExposeView(target?: AppEventTarget | null): void {
  emitEvent("exposeToggle", undefined, target);
}

export function onExposeToggle(
  handler: () => void,
  target?: AppEventTarget | null,
): () => void {
  return subscribeToEvent(
    "exposeToggle",
    () => {
      handler();
    },
    target,
  );
}

export function selectExposeWindow(
  detail: ExposeWindowSelectEventDetail,
  target?: AppEventTarget | null,
): void {
  emitEvent("exposeWindowSelect", detail, target);
}

export function onExposeWindowSelect(
  handler: (event: CustomEvent<ExposeWindowSelectEventDetail>) => void,
  target?: AppEventTarget | null,
): () => void {
  return subscribeToEvent("exposeWindowSelect", handler, target);
}

export function emitFileSaved(
  detail: FileSavedEventDetail,
  target?: AppEventTarget | null,
): void {
  emitEvent("fileSaved", detail, target);
}

export function emitFileUpdated(
  detail: FileUpdatedEventDetail,
  target?: AppEventTarget | null,
): void {
  emitEvent("fileUpdated", detail, target);
}

export function emitFileRenamed(
  detail: FileRenamedEventDetail,
  target?: AppEventTarget | null,
): void {
  emitEvent("fileRenamed", detail, target);
}

export function emitDocumentUpdated(
  detail: DocumentUpdatedEventDetail,
  target?: AppEventTarget | null,
): void {
  emitEvent("documentUpdated", detail, target);
}

export function onDocumentUpdated(
  handler: (event: CustomEvent<DocumentUpdatedEventDetail>) => void,
  target?: AppEventTarget | null,
): () => void {
  return subscribeToEvent("documentUpdated", handler, target);
}

export function emitAppletUpdated(
  detail: AppletUpdatedEventDetail,
  target?: AppEventTarget | null,
): void {
  emitEvent("appletUpdated", detail, target);
}

export function onAppletUpdated(
  handler: (event: CustomEvent<AppletUpdatedEventDetail>) => void,
  target?: AppEventTarget | null,
): () => void {
  return subscribeToEvent("appletUpdated", handler, target);
}
