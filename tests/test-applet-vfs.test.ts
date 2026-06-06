import { describe, expect, mock, test } from "bun:test";
import {
  type FileSystemItem,
  useFilesStore,
} from "../src/stores/useFilesStore";

const loadFileContentMock = mock(async () => null as Awaited<
  ReturnType<typeof import("../src/utils/indexedDBOperations").loadFileContent>
>);
const saveFileContentMock = mock(async () => undefined);

mock.module("../src/utils/indexedDBOperations", () => ({
  loadFileContent: loadFileContentMock,
  saveFileContent: saveFileContentMock,
  getStoreForPath: () => null,
  getStoreForFile: () => null,
  getContentSize: () => 0,
  STORES: { DOCUMENTS: "documents", IMAGES: "images", APPLETS: "applets" },
}));

const {
  fetchAndCacheAppletContentFromShare,
  normalizeVfsPath,
  readAppletContent,
  resolveVfsFileItem,
} = await import("../src/utils/appletVfs");

function makeAppletItem(
  path: string,
  overrides: Partial<FileSystemItem> = {}
): FileSystemItem {
  const name = path.split("/").pop() || path;
  return {
    path,
    name,
    isDirectory: false,
    status: "active",
    type: "html",
    uuid: `uuid-${name}`,
    ...overrides,
  };
}

describe("applet VFS helpers", () => {
  test("normalizeVfsPath normalizes applet paths", () => {
    expect(normalizeVfsPath("Applets/Weather.app")).toBe("/Applets/Weather.app");
    expect(normalizeVfsPath("/Applets/Currency%20Converter.app")).toBe(
      "/Applets/Currency Converter.app"
    );
    expect(normalizeVfsPath("/applets/weather.app")).toBe("/Applets/weather.app");
  });

  test("resolveVfsFileItem finds applets by normalized paths", () => {
    const weather = makeAppletItem("/Applets/Weather.app", {
      shareId: "weather-share",
    });

    const previousItems = { ...useFilesStore.getState().items };
    useFilesStore.setState({ items: { [weather.path]: weather } });

    try {
      expect(resolveVfsFileItem("Applets/Weather.app")?.path).toBe(weather.path);
      expect(resolveVfsFileItem("/applets/weather.app")?.path).toBe(weather.path);
    } finally {
      useFilesStore.setState({ items: previousItems });
    }
  });

  test("readAppletContent hydrates share-backed applets when IndexedDB is empty", async () => {
    const path = "/Applets/Weather.app";
    const uuid = `weather-applet-${Date.now()}`;
    const item = makeAppletItem(path, {
      uuid,
      shareId: "356e97a80449c725c07a91c4dd07fb87",
    });
    const html = "<html><body>Shared weather</body></html>";
    const previousItems = { ...useFilesStore.getState().items };
    const originalFetch = globalThis.fetch;

    loadFileContentMock.mockImplementation(async () => null);
    saveFileContentMock.mockImplementation(async () => undefined);
    useFilesStore.setState({ items: { [path]: item } });
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ content: html }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    try {
      const result = await readAppletContent(path);
      expect(result.content).toBe(html);
      expect(saveFileContentMock).toHaveBeenCalledWith(
        uuid,
        item.name,
        html,
        "applets"
      );
    } finally {
      globalThis.fetch = originalFetch;
      useFilesStore.setState({ items: previousItems });
    }
  });

  test("readAppletContent returns cached IndexedDB content", async () => {
    const path = "/Applets/Saved.app";
    const item = makeAppletItem(path);
    const html = "<html><body>Saved</body></html>";
    const previousItems = { ...useFilesStore.getState().items };

    loadFileContentMock.mockImplementation(async () => ({
      name: item.name,
      content: html,
    }));
    useFilesStore.setState({ items: { [path]: item } });

    try {
      const result = await readAppletContent(path, { fetchIfMissing: false });
      expect(result.content).toBe(html);
    } finally {
      useFilesStore.setState({ items: previousItems });
    }
  });

  test("fetchAndCacheAppletContentFromShare returns null without share metadata", async () => {
    const result = await fetchAndCacheAppletContentFromShare(
      "/Applets/Broken.app",
      makeAppletItem("/Applets/Broken.app", { shareId: undefined, uuid: "x" })
    );
    expect(result).toBeNull();
  });
});
