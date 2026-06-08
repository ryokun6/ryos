export interface ShortIdMap {
  shortToFull: Map<string, string>;
  fullToShort: Map<string, string>;
}

export function createShortIdMap(
  fullIds: string[],
  prefix: string = "s"
): ShortIdMap {
  const shortToFull = new Map<string, string>();
  const fullToShort = new Map<string, string>();

  fullIds.forEach((fullId, index) => {
    const shortId = `${prefix}${index + 1}`;
    shortToFull.set(shortId, fullId);
    fullToShort.set(fullId, shortId);
  });

  return { shortToFull, fullToShort };
}

export function resolveId(
  id: string,
  map: ShortIdMap | undefined
): string {
  return map?.shortToFull.get(id) || id;
}
