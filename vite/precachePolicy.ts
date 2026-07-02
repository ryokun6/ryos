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
