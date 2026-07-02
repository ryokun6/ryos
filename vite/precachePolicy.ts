export const OPTIONAL_PRECACHE_CHUNK_PREFIXES = [
  "ai-sdk",
  "audio",
  "hangul",
  "media-player",
  "mermaid",
  "pusher",
  "shiki",
  "three",
  "tiptap",
  "webamp",
] as const;

export const HEAVY_PRECACHE_PACKAGES =
  /[/\\]node_modules[/\\](?:\.pnpm[/\\][^/\\]+[/\\]node_modules[/\\])?(?:shiki|@shikijs|mermaid|@streamdown[/\\](?:code|mermaid)|webamp|v86|pusher-js|react-player)[/\\]/;

type PrecacheChunk = {
  fileName: string;
  moduleIds: readonly string[];
  facadeModuleId?: string | null;
};

export type PrecacheGraphChunk = {
  fileName: string;
  imports: readonly string[];
  isEntry?: boolean;
  facadeModuleId?: string | null;
};

export function collectStaticPrecacheChunkClosure(
  chunks: readonly PrecacheGraphChunk[]
): Set<string> {
  const byFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const mainEntries = chunks.filter((chunk) =>
    /[/\\]src[/\\]main\.tsx$/.test(chunk.facadeModuleId ?? "")
  );
  const roots =
    mainEntries.length > 0
      ? mainEntries
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

export function isOptionalPrecacheChunkName(fileName: string): boolean {
  const baseName = fileName.split("/").pop() ?? fileName;
  return OPTIONAL_PRECACHE_CHUNK_PREFIXES.some(
    (prefix) =>
      baseName === `${prefix}.js` ||
      baseName.startsWith(`${prefix}-`) ||
      baseName.startsWith(`${prefix}.`)
  );
}

function isLazyAppFacade(facadeModuleId?: string | null): boolean {
  return Boolean(
    facadeModuleId &&
      /[/\\]src[/\\]apps[/\\]/.test(facadeModuleId)
  );
}

function isFullLocaleFacade(facadeModuleId?: string | null): boolean {
  return Boolean(
    facadeModuleId &&
      /[/\\]src[/\\]lib[/\\]locales[/\\][^/\\]+[/\\]translation\.json$/.test(
        facadeModuleId
      )
  );
}

export function shouldExcludePrecacheChunk({
  fileName,
  moduleIds,
  facadeModuleId,
}: PrecacheChunk): boolean {
  if (
    isOptionalPrecacheChunkName(fileName) ||
    isLazyAppFacade(facadeModuleId) ||
    isFullLocaleFacade(facadeModuleId)
  ) {
    return true;
  }

  if (moduleIds.length === 0) {
    return false;
  }

  const allHeavy = moduleIds.every((id) =>
    HEAVY_PRECACHE_PACKAGES.test(id)
  );
  const heavyFacade = Boolean(
    facadeModuleId && HEAVY_PRECACHE_PACKAGES.test(facadeModuleId)
  );
  return allHeavy || heavyFacade;
}
