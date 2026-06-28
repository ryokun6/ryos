/**
 * Minimal localStorage stub for store-importing unit tests. Import this
 * module FIRST (before any src/stores import) so module-level storage
 * reads don't crash under bun's bare runtime.
 */
import { ensureTestLocalStorage as installLocalStorageStub } from "./setup";

export { MemoryStorage, ensureTestLocalStorage } from "./setup";

installLocalStorageStub();
