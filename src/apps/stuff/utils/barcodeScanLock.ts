/**
 * One-shot / debounce lock for continuous barcode decode loops.
 * Prevents repeated callbacks (and beeps) for the same code while the
 * camera keeps producing frames after a successful read.
 */
export interface BarcodeScanLock {
  /** Returns true the first time a code is accepted; false if locked or same code within cooldown. */
  tryAccept: (code: string) => boolean;
  /** Clear the accept lock (keeps last-code cooldown memory). */
  unlock: () => void;
  /** Full reset for a new scanner session. */
  reset: () => void;
}

export interface BarcodeScanLockOptions {
  /** Ignore re-reads of the same code within this window (ms). Default 2000. */
  cooldownMs?: number;
  /** Clock override for tests. */
  now?: () => number;
}

export function createBarcodeScanLock(
  options: BarcodeScanLockOptions = {}
): BarcodeScanLock {
  const cooldownMs = options.cooldownMs ?? 2000;
  const now = options.now ?? Date.now;
  let locked = false;
  let lastCode: string | null = null;
  let lastAcceptedAt = 0;

  return {
    tryAccept(code: string) {
      const text = code.trim();
      if (!text || locked) return false;
      const t = now();
      if (lastCode === text && t - lastAcceptedAt < cooldownMs) {
        return false;
      }
      locked = true;
      lastCode = text;
      lastAcceptedAt = t;
      return true;
    },
    unlock() {
      locked = false;
    },
    reset() {
      locked = false;
      lastCode = null;
      lastAcceptedAt = 0;
    },
  };
}
