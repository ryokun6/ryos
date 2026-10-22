import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison for bearer secrets. Both sides are hashed
 * to equal-length SHA-256 digests first, so neither the content nor the
 * length of the expected secret leaks through timing.
 */
export function secretsEqual(
  provided: string | null | undefined,
  expected: string
): boolean {
  if (typeof provided !== "string" || !expected) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
