/**
 * Assign a value on `globalThis` even when happy-dom left the property
 * readonly (e.g. `window` after `GlobalRegistrator.register()`).
 */
export function assignGlobal(key: string, value: unknown): void {
  try {
    (globalThis as Record<string, unknown>)[key] = value;
  } catch {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value,
    });
  }
}
