/**
 * Pure helpers that turn a flat list of Redis keys into a navigable,
 * prefix-grouped tree (folders + leaves), breadcrumb segments, and a
 * client-side flat filter. Kept free of React/UI so it can be unit tested.
 *
 * Redis keys in ryOS are namespaced with `:` (e.g. `chat:room:abc`), so we
 * group keys by that separator and let the UI drill into one level at a time.
 */

export const REDIS_KEY_SEPARATOR = ":";

export interface RedisKeyNode {
  key: string;
  type: string;
  ttl: number | null;
}

/** A namespace folder at the current level (e.g. `room:` under `chat:`). */
export interface RedisTreeFolder {
  /** The segment label without separator (e.g. `room`). */
  segment: string;
  /** Full prefix including trailing separator (e.g. `chat:room:`). */
  prefix: string;
  /** Number of loaded keys that live under this folder. */
  count: number;
}

/** A concrete key at the current level. */
export interface RedisTreeLeaf {
  key: string;
  /** Label relative to the current prefix (e.g. `users:ryo` under `chat:`). */
  label: string;
  type: string;
  ttl: number | null;
}

export interface RedisTreeLevel {
  folders: RedisTreeFolder[];
  leaves: RedisTreeLeaf[];
}

export interface RedisBreadcrumb {
  /** Display label for the segment (empty-string prefix renders as root). */
  label: string;
  /** Full prefix this crumb navigates to (e.g. `chat:room:`). */
  prefix: string;
}

/**
 * Group `keys` by their immediate namespace segment relative to `prefix`.
 * Keys that have no further separator beyond `prefix` become leaves; keys with
 * deeper namespacing roll up into folders with counts.
 */
export function buildRedisKeyTree(
  keys: RedisKeyNode[],
  prefix: string = "",
  separator: string = REDIS_KEY_SEPARATOR
): RedisTreeLevel {
  const folderOrder: string[] = [];
  const folderCounts = new Map<string, number>();
  const leaves: RedisTreeLeaf[] = [];

  for (const node of keys) {
    if (prefix && !node.key.startsWith(prefix)) continue;
    const rest = node.key.slice(prefix.length);
    if (rest.length === 0) continue;

    const separatorIndex = rest.indexOf(separator);
    if (separatorIndex === -1) {
      leaves.push({
        key: node.key,
        label: rest,
        type: node.type,
        ttl: node.ttl,
      });
      continue;
    }

    const segment = rest.slice(0, separatorIndex);
    const folderPrefix = `${prefix}${segment}${separator}`;
    if (!folderCounts.has(folderPrefix)) {
      folderOrder.push(folderPrefix);
      folderCounts.set(folderPrefix, 0);
    }
    folderCounts.set(folderPrefix, (folderCounts.get(folderPrefix) ?? 0) + 1);
  }

  const folders: RedisTreeFolder[] = folderOrder
    .map((folderPrefix) => ({
      prefix: folderPrefix,
      segment: folderPrefix.slice(prefix.length, folderPrefix.length - separator.length),
      count: folderCounts.get(folderPrefix) ?? 0,
    }))
    .sort((a, b) => a.segment.localeCompare(b.segment));

  leaves.sort((a, b) => a.label.localeCompare(b.label));

  return { folders, leaves };
}

/**
 * Build breadcrumb segments for the current `prefix`, always starting with a
 * root crumb (empty prefix).
 */
export function buildRedisBreadcrumbs(
  prefix: string,
  separator: string = REDIS_KEY_SEPARATOR
): RedisBreadcrumb[] {
  const crumbs: RedisBreadcrumb[] = [{ label: "", prefix: "" }];
  if (!prefix) return crumbs;

  const segments = prefix.split(separator).filter((segment) => segment.length > 0);
  let accumulated = "";
  for (const segment of segments) {
    accumulated += `${segment}${separator}`;
    crumbs.push({ label: segment, prefix: accumulated });
  }
  return crumbs;
}

/**
 * Flat, case-insensitive substring search across all loaded keys. Used when the
 * user types in the filter box (search wins over prefix navigation).
 */
export function filterRedisKeys(
  keys: RedisKeyNode[],
  query: string
): RedisTreeLeaf[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  return keys
    .filter((node) => node.key.toLowerCase().includes(trimmed))
    .map((node) => ({
      key: node.key,
      label: node.key,
      type: node.type,
      ttl: node.ttl,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
