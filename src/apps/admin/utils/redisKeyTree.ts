/**
 * Pure helpers that turn a flat list of Redis keys into a navigable,
 * prefix-grouped tree (folders + leaves), breadcrumb segments, and a
 * breadcrumb segments. Kept free of React/UI so it can be unit tested.
 *
 * Redis keys in ryOS are namespaced with `:` (e.g. `chat:room:abc`), so we
 * group keys by that separator and let the UI drill into one level at a time.
 */

export const REDIS_KEY_SEPARATOR = ":";

/**
 * Top-level Redis namespaces ryOS is known to use, surfaced as instant
 * entry-point folders at the root of the browser so the admin can drill into a
 * scoped SCAN without first paging through a global `*` scan. Kept in sync with
 * the key builders across `api/` (chat/sync/analytics/memory/etc.).
 */
export const KNOWN_REDIS_PREFIXES: string[] = [
  "chat",
  "sync",
  "sync2",
  "analytics",
  "memory",
  "system",
  "airdrop",
  "song",
  "listen",
  "applet",
  "apple",
  "ie",
  "wayback",
  "cursor-sdk-run",
  "cursor-sdk-agent",
  "ryos",
  "rl",
];

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
  /**
   * Number of loaded keys under this folder. `undefined` for a known prefix
   * that has not been scanned yet (rendered without a count badge).
   */
  count?: number;
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
 * Derive the namespace folder a SCAN pattern lives in, so typing (or applying)
 * a pattern like `chat:users:*` lands inside the `chat:users:` folder rather
 * than at the root. The prefix is the run of leading literal (glob-free)
 * segments, excluding the final/leaf segment and stopping at the first segment
 * that contains a glob character.
 *
 * Examples: `chat:users:*` → `chat:users:`, `chat:*` → `chat:`,
 * `chat:users:ry*` → `chat:users:`, `chat:users:ryo` → `chat:users:`,
 * `*` / `chat` / `chat*` → ``.
 */
export function deriveRedisPrefix(
  pattern: string,
  separator: string = REDIS_KEY_SEPARATOR
): string {
  if (!pattern || pattern === "*") return "";
  const hasGlob = (segment: string) => /[*?[\]]/.test(segment);
  const segments = pattern.split(separator);
  const prefixSegments: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const isLast = i === segments.length - 1;
    if (hasGlob(segments[i]) || isLast) break;
    prefixSegments.push(segments[i]);
  }
  if (prefixSegments.length === 0) return "";
  return prefixSegments.join(separator) + separator;
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
 * Merge discovered folders with the curated known prefixes so every known
 * namespace is shown at the root level even before its keys are scanned.
 * Discovered counts win; known-only entries get an `undefined` count.
 */
export function mergeFoldersWithKnownPrefixes(
  discovered: RedisTreeFolder[],
  knownSegments: string[] = KNOWN_REDIS_PREFIXES,
  separator: string = REDIS_KEY_SEPARATOR
): RedisTreeFolder[] {
  const byPrefix = new Map<string, RedisTreeFolder>();
  for (const folder of discovered) {
    byPrefix.set(folder.prefix, folder);
  }
  for (const segment of knownSegments) {
    const prefix = `${segment}${separator}`;
    if (!byPrefix.has(prefix)) {
      byPrefix.set(prefix, { segment, prefix, count: undefined });
    }
  }
  return Array.from(byPrefix.values()).sort((a, b) =>
    a.segment.localeCompare(b.segment)
  );
}
