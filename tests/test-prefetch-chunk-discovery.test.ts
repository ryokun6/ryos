import { describe, test, expect } from "bun:test";
import {
  normalizeViteAssetPath,
  extractUrlsFromViteMapDeps,
  extractAssetUrlsFromBundle,
  extractLazyEntryChunkPaths,
  discoverPrefetchAssetUrls,
  mergeDiscoveredAssetUrls,
} from "../src/utils/prefetchChunkDiscovery";

describe("normalizeViteAssetPath", () => {
  test("normalizes assets/ and ./ paths", () => {
    expect(normalizeViteAssetPath("assets/Foo-Bar.js")).toBe("/assets/Foo-Bar.js");
    expect(normalizeViteAssetPath("./PhotoBoothComponent-X.js")).toBe(
      "/assets/PhotoBoothComponent-X.js"
    );
    expect(normalizeViteAssetPath('"./mermaid-ABC-DEF.js"')).toBe(
      "/assets/mermaid-ABC-DEF.js"
    );
  });
});

describe("extractUrlsFromViteMapDeps", () => {
  test("parses phosphor .es chunks and css from mapDeps", () => {
    const code = `__vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/Microphone.es-DuLwkkSf.js","assets/mermaid-GHXKKRXX-Yd9OhMyU.css","assets/ChatsAppComponent-abc.js"])))`;
    const urls = extractUrlsFromViteMapDeps(code);
    expect(urls).toContain("/assets/Microphone.es-DuLwkkSf.js");
    expect(urls).toContain("/assets/mermaid-GHXKKRXX-Yd9OhMyU.css");
    expect(urls).toContain("/assets/ChatsAppComponent-abc.js");
  });
});

describe("extractAssetUrlsFromBundle", () => {
  test("finds .es.js chunks missed by legacy double-hash regex", () => {
    const code = `import("./mermaid-GHXKKRXX-C6DgPKtK.js");"assets/SpeakerHigh.es-DaNzNEV6.js"`;
    const urls = extractAssetUrlsFromBundle(code);
    expect(urls).toContain("/assets/mermaid-GHXKKRXX-C6DgPKtK.js");
    expect(urls).toContain("/assets/SpeakerHigh.es-DaNzNEV6.js");
  });
});

describe("extractLazyEntryChunkPaths", () => {
  test("collects lazy app import targets", () => {
    const code = `import("./PaintAppComponent-DNkmEfwx.js"),import("./mermaid-GHXKKRXX-C6DgPKtK.js")`;
    const paths = extractLazyEntryChunkPaths(code);
    expect(paths).toContain("/assets/PaintAppComponent-DNkmEfwx.js");
    expect(paths).toContain("/assets/mermaid-GHXKKRXX-C6DgPKtK.js");
  });
});

describe("discoverPrefetchAssetUrls", () => {
  test("merges mapDeps, regex assets, and nested bundle scans", () => {
    const main = `m.f=["assets/TextEditAppComponent-B1.js","assets/ui-core-9j.js"]
import("./mermaid-GHXKKRXX-C6DgPKtK.js")`;
    const nested = `"assets/CursorRepoAgentChatCard-CqbmG3bY.js"`;
    const urls = discoverPrefetchAssetUrls(main, [nested]);
    expect(urls).toEqual(
      mergeDiscoveredAssetUrls(
        extractUrlsFromViteMapDeps(main),
        extractAssetUrlsFromBundle(main),
        extractLazyEntryChunkPaths(main),
        extractUrlsFromViteMapDeps(nested),
        extractAssetUrlsFromBundle(nested)
      )
    );
    expect(urls).toContain("/assets/CursorRepoAgentChatCard-CqbmG3bY.js");
    expect(urls).toContain("/assets/mermaid-GHXKKRXX-C6DgPKtK.js");
  });
});
