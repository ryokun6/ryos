export type PrecacheGraphChunk = {
  fileName: string;
  imports: readonly string[];
  isEntry?: boolean;
  facadeModuleId?: string | null;
};

function isOfflinePrecacheRoot(chunk: PrecacheGraphChunk): boolean {
  const facadeModuleId = chunk.facadeModuleId ?? "";
  return (
    /[/\\]src[/\\]main\.tsx$/.test(facadeModuleId) ||
    /[/\\]src[/\\]apps[/\\]/.test(facadeModuleId) ||
    /[/\\]src[/\\]lib[/\\]locales[/\\][^/\\]+[/\\]translation\.json$/.test(
      facadeModuleId
    )
  );
}

/**
 * Include the shell, every app and every locale catalog plus their static
 * imports. Optional features that apps import dynamically remain runtime
 * cached on first use.
 */
export function collectOfflinePrecacheChunkClosure(
  chunks: readonly PrecacheGraphChunk[]
): Set<string> {
  const byFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const offlineRoots = chunks.filter(isOfflinePrecacheRoot);
  const roots =
    offlineRoots.length > 0
      ? offlineRoots
      : chunks.filter((chunk) => chunk.isEntry);
  const closure = new Set<string>();
  const queue = roots.map((chunk) => chunk.fileName);

  while (queue.length > 0) {
    const fileName = queue.shift()!;
    if (closure.has(fileName)) continue;
    closure.add(fileName);
    const chunk = byFileName.get(fileName);
    if (!chunk) continue;
    for (const dependency of chunk.imports) {
      if (!closure.has(dependency)) {
        queue.push(dependency);
      }
    }
  }
  return closure;
}
