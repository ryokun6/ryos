import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  SYSTEM_FONT_OPTIONS,
  THEME_DEFAULT_SYSTEM_FONT,
} from "../../../src/themes/systemFonts";

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

type FakeRoot = {
  dataset: Record<string, string>;
  style: {
    colorScheme: string;
    getPropertyValue: (name: string) => string;
    removeProperty: (name: string) => void;
    setProperty: (name: string, value: string) => void;
  };
  classList: {
    add: (...tokens: string[]) => void;
    remove: (...tokens: string[]) => void;
  };
};

function createFakeRoot(): FakeRoot {
  const properties = new Map<string, string>();
  return {
    dataset: {},
    style: {
      colorScheme: "",
      getPropertyValue: (name) => properties.get(name) ?? "",
      removeProperty: (name) => {
        properties.delete(name);
      },
      setProperty: (name, value) => {
        properties.set(name, value);
      },
    },
    classList: {
      add: () => {},
      remove: () => {},
    },
  };
}

const originalDocument = globalThis.document;
const originalLocalStorage = globalThis.localStorage;

let root: FakeRoot;

beforeEach(() => {
  root = createFakeRoot();
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      documentElement: root,
      head: {
        appendChild: () => {},
      },
      createElement: () => ({
        dataset: {},
        rel: "",
        href: "",
      }),
    },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new MemoryStorage(),
    writable: true,
  });
});

afterEach(async () => {
  const { useThemeStore } = await import("../../../src/stores/useThemeStore");
  useThemeStore.setState({ systemFont: THEME_DEFAULT_SYSTEM_FONT });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: originalDocument,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: originalLocalStorage,
    writable: true,
  });
});

describe("system font debug options", () => {
  test("includes theme defaults, retro defaults, and modern system stacks", () => {
    expect(SYSTEM_FONT_OPTIONS.map((option) => option.id)).toEqual([
      "theme-default",
      "lucida-grande",
      "geneva",
      "chicago",
      "ms-sans-serif",
      "helvetica-neue",
      "myriad-pro",
      "system",
    ]);
  });

  test("hydrates a stored font override onto the root UI font variable", async () => {
    localStorage.setItem("ryos:theme:system-font", "myriad-pro");
    const { useThemeStore } = await import("../../../src/stores/useThemeStore");

    useThemeStore.getState().hydrate();

    expect(useThemeStore.getState().systemFont).toBe("myriad-pro");
    expect(root.style.getPropertyValue("--os-font-ui")).toContain("MyriadPro");
    expect(root.dataset.osSystemFont).toBe("myriad-pro");
  });

  test("restores theme defaults by removing the root UI font override", async () => {
    const { useThemeStore } = await import("../../../src/stores/useThemeStore");

    useThemeStore.getState().setSystemFont("helvetica-neue");
    expect(localStorage.getItem("ryos:theme:system-font")).toBe("helvetica-neue");
    expect(root.style.getPropertyValue("--os-font-ui")).toContain(
      "Helvetica Neue"
    );

    useThemeStore.getState().setSystemFont(THEME_DEFAULT_SYSTEM_FONT);

    expect(localStorage.getItem("ryos:theme:system-font")).toBeNull();
    expect(root.style.getPropertyValue("--os-font-ui")).toBe("");
    expect(root.dataset.osSystemFont).toBeUndefined();
  });
});
