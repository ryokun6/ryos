export type SyncTextEditDocumentOptions = {
  path: string;
  content: string;
  fileName?: string;
  launchIfMissing: boolean;
  bringToForeground: boolean;
  includeFilePathOnUpdate: boolean;
};

export type SyncTextEditDocumentResult = {
  instanceId: string | null;
  updated: boolean;
  launched: boolean;
};

export type TextEditInstanceLike = {
  filePath: string | null;
};

export type TextEditDocumentSyncDependencies<TContentJson> = {
  appInstances: Record<string, unknown>;
  foregroundInstanceId?: string | null;
  instanceOrder?: string[];
  textEditInstances: Record<string, TextEditInstanceLike>;
  removeTextEditInstance: (instanceId: string) => void;
  updateTextEditInstance: (
    instanceId: string,
    updates: {
      filePath?: string;
      contentJson: TContentJson;
      hasUnsavedChanges: boolean;
    },
  ) => void;
  bringToForeground: (instanceId: string) => void;
  launchTextEdit: (
    initialData: { path: string; content: string },
    windowTitle: string,
  ) => string;
  buildContentJson: (content: string) => TContentJson;
  dispatchDocumentUpdated: (path: string, contentJson: TContentJson) => void;
};

export const buildTextEditWindowTitle = (fileName?: string): string =>
  (fileName || "").replace(/\.md$/i, "") || "Untitled";

export const findLiveTextEditInstanceIdByPath = <TContentJson>(
  path: string,
  dependencies: TextEditDocumentSyncDependencies<TContentJson>,
): string | null => {
  const liveMatches: string[] = [];

  for (const [instanceId, instance] of Object.entries(
    dependencies.textEditInstances,
  )) {
    if (instance.filePath !== path) {
      continue;
    }

    if (dependencies.appInstances[instanceId]) {
      liveMatches.push(instanceId);
      continue;
    }

    dependencies.removeTextEditInstance(instanceId);
  }

  if (liveMatches.length === 0) {
    return null;
  }

  const foregroundId = dependencies.foregroundInstanceId;
  if (foregroundId && liveMatches.includes(foregroundId)) {
    return foregroundId;
  }

  if (dependencies.instanceOrder && dependencies.instanceOrder.length > 0) {
    const liveMatchSet = new Set(liveMatches);
    for (let index = dependencies.instanceOrder.length - 1; index >= 0; index--) {
      const instanceId = dependencies.instanceOrder[index];
      if (instanceId && liveMatchSet.has(instanceId)) {
        return instanceId;
      }
    }
  }

  return liveMatches[liveMatches.length - 1] || null;
};

export const syncTextEditDocumentForPathCore = <TContentJson>(
  options: SyncTextEditDocumentOptions,
  dependencies: TextEditDocumentSyncDependencies<TContentJson>,
): SyncTextEditDocumentResult => {
  const liveInstanceId = findLiveTextEditInstanceIdByPath(
    options.path,
    dependencies,
  );

  if (liveInstanceId) {
    const contentJson = dependencies.buildContentJson(options.content);
    dependencies.updateTextEditInstance(liveInstanceId, {
      ...(options.includeFilePathOnUpdate ? { filePath: options.path } : {}),
      contentJson,
      hasUnsavedChanges: false,
    });
    dependencies.dispatchDocumentUpdated(options.path, contentJson);

    if (options.bringToForeground) {
      dependencies.bringToForeground(liveInstanceId);
    }

    return {
      instanceId: liveInstanceId,
      updated: true,
      launched: false,
    };
  }

  if (!options.launchIfMissing) {
    return {
      instanceId: null,
      updated: false,
      launched: false,
    };
  }

  const launchedInstanceId = dependencies.launchTextEdit(
    { path: options.path, content: options.content },
    buildTextEditWindowTitle(options.fileName),
  );

  return {
    instanceId: launchedInstanceId,
    updated: false,
    launched: true,
  };
};
