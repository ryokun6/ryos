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
  AppletVfsError,
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
  test("normalizeVfsPath adds leading slash, decodes segments, and collapses slashes", () => {
    expect(normalizeVfsPath("Applets/Weather.app")).toBe("/Applets/Weather.app");
    expect(normalizeVfsPath("/Applets/Currency%20Converter.app")).toBe(
      "/Applets/Currency Converter.app"
    );
    expect(normalizeVfsPath("//Applets//Weather.app")).toBe("/Applets/Weather.app");
    expect(normalizeVfsPath("  /Applets/Weather.app  ")).toBe(
      "/Applets/Weather.app"
    );
    expect(normalizeVfsPath("/applets/weather.app")).toBe("/Applets/weather.app");
  });

  test("resolveVfsFileItem finds applets by normalized and case-insensitive paths", () => {
    const weather = makeAppletItem("/Applets/Weather.app", {
      shareId: "weather-share",
    });
    const currency = makeAppletItem("/Applets/Currency Converter.app", {
      shareId: "currency-share",
    });

    const previousItems = { ...useFilesStore.getState().items };
    useFilesStore.setState({
      items: {
        [weather.path]: weather,
        [currency.path]: currency,
      },
    });

    try {
      expect(resolveVfsFileItem("Applets/Weather.app")?.path).toBe(weather.path);
      expect(resolveVfsFileItem("/Applets/Currency%20Converter.app")?.path).toBe(
        currency.path
      );
      expect(resolveVfsFileItem("/applets/weather.app")?.path).toBe(weather.path);
      expect(resolveVfsFileItem("/Applets/Missing.app")).toBeUndefined();
      expect(resolveVfsFileItem("/Documents/notes.md")).toBeUndefined();
    } finally {
      useFilesStore.setState({ items: previousItems });
    }
  });

  test("AppletVfsError exposes stable error codes", () => {
    const error = new AppletVfsError("Applet not found", "not_found");
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("not_found");
    expect(error.message).toBe("Applet not found");
  });

  test("readAppletContent hydrates share-backed applets when IndexedDB is empty", async () => {
    const path = "/Applets/Weather.app";
    const uuid = `weather-applet-${Date.now()}`;
    const shareId = "356e97a80449c725c07a91c4dd07fb87";
    const item = makeAppletItem(path, { uuid, shareId });
    const html = "<html><body>Shared weather</body></html>";

    const previousItems = { ...useFilesStore.getState().items };
    const originalFetch = globalThis.fetch;

    loadFileContentMock.mockImplementation(async () => null);
    saveFileContentMock.mockImplementation(async () => undefined);

    useFilesStore.setState({ items: { [path]: item } });
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          content: html,
          title: "Weather",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )) as typeof fetch;

    try {
      const result = await readAppletContent(path);
      expect(result.source).toBe("share");
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

  test("readAppletContent returns cached IndexedDB content after local save", async () => {
    const path = "/Applets/Saved.app";
    const uuid = `saved-applet-${Date.now()}`;
    const html = "<html><body>Saved</body></html>";
    const item = makeAppletItem(path, { uuid });

    const previousItems = { ...useFilesStore.getState().items };

    loadFileContentMock.mockImplementation(async () => ({
      name: item.name,
      content: html,
    }));

    useFilesStore.setState({ items: { [path]: item } });

    try {
      const result = await readAppletContent(path, { fetchIfMissing: false });
      expect(result.source).toBe("indexeddb");
      expect(result.content).toBe(html);
      expect(result.fileItem.path).toBe(path);
    } finally {
      useFilesStore.setState({ items: previousItems });
    }
  });

  test("fetchAndCacheAppletContentFromShare returns null for missing share metadata", async () => {
    const result = await fetchAndCacheAppletContentFromShare(
      "/Applets/Broken.app",
      makeAppletItem("/Applets/Broken.app", { shareId: undefined, uuid: "x" })
    );
    expect(result).toBeNull();
  });
});
