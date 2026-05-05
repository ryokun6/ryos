import { describe, expect, test, beforeEach, beforeAll } from "bun:test";

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

let useInboxStore: typeof import("@/stores/useInboxStore").useInboxStore;
let createWelcomeInboxItem: typeof import("@/stores/useInboxStore").createWelcomeInboxItem;

beforeAll(async () => {
  globalThis.localStorage = new MemoryStorage();
  (globalThis as unknown as { window: typeof globalThis }).window = globalThis;
  const mod = await import("@/stores/useInboxStore");
  useInboxStore = mod.useInboxStore;
  createWelcomeInboxItem = mod.createWelcomeInboxItem;
});

describe("useInboxStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useInboxStore.setState({ items: [] });
  });

  test("upsert dedupes by applet_updated path key", () => {
    useInboxStore.getState().upsertItem({
      dedupeKey: "applet_updated:/Applets/foo.html",
      category: "applet",
      title: "Applet updated",
      preview: "first",
    });
    useInboxStore.getState().upsertItem({
      dedupeKey: "applet_updated:/Applets/foo.html",
      category: "applet",
      title: "Applet updated",
      preview: "second save",
    });
    const items = useInboxStore.getState().items;
    expect(items.length).toBe(1);
    expect(items[0].preview).toBe("second save");
    expect(items[0].readAt).toBeNull();
  });

  test("createWelcomeInboxItem has stable dedupe key", () => {
    const w = createWelcomeInboxItem(1);
    expect(w.dedupeKey).toBe("welcome:v1");
    expect(w.category).toBe("system");
  });

  test("clearRead removes only read items", () => {
    const id = useInboxStore.getState().upsertItem({
      category: "system",
      title: "a",
      preview: "p",
    });
    useInboxStore.getState().markRead(id);
    useInboxStore.getState().upsertItem({
      category: "system",
      title: "b",
      preview: "q",
    });
    useInboxStore.getState().clearRead();
    expect(useInboxStore.getState().items.length).toBe(1);
    expect(useInboxStore.getState().items[0].title).toBe("b");
  });
});
