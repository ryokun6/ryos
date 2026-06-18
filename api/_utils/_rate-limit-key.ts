/**
 * Pure rate-limit key builders.
 *
 * This module intentionally has **no** dependency on the Redis client or the
 * auth module so it can be imported from anywhere (including the auth module
 * itself) without creating an import cycle. `_rate-limit.ts` re-exports these
 * helpers for backward compatibility.
 *
 * Every runtime rate-limit counter/block flag is keyed under the canonical
 * `rate:` namespace (see `src/shared/redisKeys.ts`). Legacy `rl:*` literals
 * are translated here so callers can keep their familiar `["rl", ...]` part
 * lists while the stored key lands under `rate:`.
 */

import { createHash } from "node:crypto";
import { redisKeys } from "../../src/shared/redisKeys.js";

export const RATE_LIMIT_PREFIX = "rate";

function normalizeRateKeyPart(part: string): string {
  return encodeURIComponent(part.trim().toLowerCase());
}

function hashRateLimitIdentifier(identifier: string): string {
  return createHash("sha256").update(identifier).digest("hex");
}

const RATE_LIMIT_SCOPE_LABELS = new Set(["anon", "host", "ip", "user"]);

function deriveRateLimitScope(parts: string[]): string {
  const labels = parts
    .map((part) => part.trim().toLowerCase())
    .filter((part) => RATE_LIMIT_SCOPE_LABELS.has(part));
  return labels.length > 0 ? labels.join("-") : "global";
}

export function makeCanonicalRateKey(parts: string[]): string {
  if (parts.length === 0) return RATE_LIMIT_PREFIX;
  const [feature = "global", window = "counter", ...identityParts] = parts;
  const normalizedFeature = normalizeRateKeyPart(feature);
  const normalizedWindow = normalizeRateKeyPart(window);
  const scope = deriveRateLimitScope(identityParts);
  const identifier = parts.join("\0");
  return redisKeys.rate.counter(
    normalizedFeature,
    normalizedWindow,
    scope,
    hashRateLimitIdentifier(identifier)
  );
}

/**
 * Build a stable key string from key parts.
 *
 * When the first part is `"rl"`, the remaining parts are translated into the
 * canonical `rate:<feature>:<window>:<scope>:<sha256>` form so legacy callers
 * never write a literal `rl:*` key. Any other leading part is treated as a
 * plain colon-joined, URL-encoded key (used by non-rate-limit callers).
 */
export function makeKey(parts: Array<string | null | undefined>): string {
  const filteredParts = parts.reduce<string[]>((acc, part) => {
    if (part !== undefined && part !== null && part !== "") {
      acc.push(String(part));
    }
    return acc;
  }, []);

  if (filteredParts[0] === "rl") {
    return makeCanonicalRateKey(filteredParts.slice(1));
  }

  return filteredParts.map((part) => encodeURIComponent(part)).join(":");
}
