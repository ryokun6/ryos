type SourceSet = Set<AudioBufferSourceNode>;

const activeSources: SourceSet = new Set();
const sourceOwners = new Map<AudioBufferSourceNode, SourceSet>();

export const getActiveSoundSourceCount = (): number => activeSources.size;

export const canStartSoundSource = (maxConcurrentSources: number): boolean =>
  activeSources.size < maxConcurrentSources;

export const trackSoundSource = (
  source: AudioBufferSourceNode,
  owner: SourceSet
): void => {
  activeSources.add(source);
  sourceOwners.set(source, owner);
  owner.add(source);
};

export const releaseSoundSource = (source: AudioBufferSourceNode): void => {
  const owner = sourceOwners.get(source);
  const wasTracked = activeSources.delete(source) || owner !== undefined;
  if (!wasTracked) return;

  owner?.delete(source);
  sourceOwners.delete(source);

  try {
    source.disconnect();
  } catch {
    // The source may already be disconnected or belong to a closed context.
  }
};

const stopAndRelease = (source: AudioBufferSourceNode): void => {
  try {
    source.stop();
  } catch {
    // The source may already have ended or belong to a closed context.
  } finally {
    releaseSoundSource(source);
  }
};

export const stopAndReleaseOwnedSoundSources = (owner: SourceSet): void => {
  Array.from(owner).forEach(stopAndRelease);
  owner.clear();
};

export const resetActiveSoundSources = (): void => {
  Array.from(activeSources).forEach(stopAndRelease);
  activeSources.clear();
  sourceOwners.clear();
};
