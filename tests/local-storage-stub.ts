/**
 * Minimal localStorage stub for store-importing unit tests. Import this
 * module FIRST (before any src/stores import) so module-level storage
 * reads don't crash under bun's bare runtime.
 */

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

if (typeof globalThis.localStorage === "undefined") {
  (globalThis as { localStorage?: Storage }).localStorage = new MemoryStorage();
}
