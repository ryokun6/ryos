export interface LiveDesktopInstanceMapping {
  getLocalInstanceId: (hostInstanceId: string) => string | undefined;
  setMapping: (hostInstanceId: string, localInstanceId: string) => void;
  removeMapping: (hostInstanceId: string) => void;
  clear: () => void;
  getHostInstanceIds: () => string[];
}

export function createLiveDesktopInstanceMapping(): LiveDesktopInstanceMapping {
  const mapping = new Map<string, string>();

  return {
    getLocalInstanceId: (hostInstanceId: string) => mapping.get(hostInstanceId),
    setMapping: (hostInstanceId: string, localInstanceId: string) => {
      mapping.set(hostInstanceId, localInstanceId);
    },
    removeMapping: (hostInstanceId: string) => {
      mapping.delete(hostInstanceId);
    },
    clear: () => {
      mapping.clear();
    },
    getHostInstanceIds: () => Array.from(mapping.keys()),
  };
}
