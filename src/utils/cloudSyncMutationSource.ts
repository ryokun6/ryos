export const CLOUD_SYNC_MUTATION_SOURCES = [
  "remote-sync",
  "system-bootstrap",
] as const;

export type CloudSyncMutationSource =
  (typeof CLOUD_SYNC_MUTATION_SOURCES)[number];

interface CloudSyncMutationFrame {
  source: CloudSyncMutationSource;
  reason?: string;
}

const activeMutationFrames: CloudSyncMutationFrame[] = [];

function removeMutationFrame(frame: CloudSyncMutationFrame): void {
  const index = activeMutationFrames.lastIndexOf(frame);
  if (index >= 0) {
    activeMutationFrames.splice(index, 1);
  }
}

export function getActiveCloudSyncMutationFrames(): readonly CloudSyncMutationFrame[] {
  return activeMutationFrames;
}

export function getActiveCloudSyncMutationSources(): readonly CloudSyncMutationSource[] {
  return Array.from(new Set(activeMutationFrames.map((frame) => frame.source)));
}

export function describeActiveCloudSyncMutationSources(): string {
  if (activeMutationFrames.length === 0) {
    return "none";
  }

  return activeMutationFrames
    .map((frame) => (frame.reason ? `${frame.source}:${frame.reason}` : frame.source))
    .join(", ");
}

export function hasActiveCloudSyncMutationSource(
  source?: CloudSyncMutationSource
): boolean {
  if (!source) {
    return activeMutationFrames.length > 0;
  }

  return activeMutationFrames.some((frame) => frame.source === source);
}

export function shouldSkipAutoCloudSyncUpload(): boolean {
  return hasActiveCloudSyncMutationSource();
}

export async function runWithCloudSyncMutationSource<T>(
  source: CloudSyncMutationSource,
  callback: () => Promise<T> | T,
  reason?: string
): Promise<T> {
  const frame: CloudSyncMutationFrame = { source, reason };
  activeMutationFrames.push(frame);

  try {
    return await callback();
  } finally {
    removeMutationFrame(frame);
  }
}

export function __resetCloudSyncMutationSourcesForTests(): void {
  activeMutationFrames.length = 0;
}
