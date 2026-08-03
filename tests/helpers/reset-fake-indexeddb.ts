/**
 * Replace `globalThis.indexedDB` with a brand-new fake-indexeddb factory.
 *
 * Bun runs every unit suite in one process. happy-dom's
 * `GlobalRegistrator.unregister()` (and leaked open connections) can leave
 * `indexedDB` in a state where `open` / `deleteDatabase` never fire events,
 * so later IndexedDB suites hang until the 5s test timeout. A fresh factory
 * isolates each suite from that cross-file pollution.
 */
import { IDBFactory } from "fake-indexeddb";

export function resetFakeIndexedDB(): void {
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: new IDBFactory(),
  });
}
