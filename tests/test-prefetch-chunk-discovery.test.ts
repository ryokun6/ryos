import { describe, test, expect } from "bun:test";

/**
 * Regression tests for prefetch chunk-reference parsing
 * (src/utils/prefetch.ts > parseChunkReferences).
 *
 * Why this exists:
 * Offline support depends on prefetching EVERY reachable JS chunk so the
 * service worker can serve it when the network is gone. The discovery used to
 * only scan the entry bundle and miss second-level dynamic imports (syntax
 * grammars, mermaid, the Spotlight worker, phosphor icon `.es` chunks, …),
 * which then failed to open offline. The parser must catch every shape Vite
 * emits chunk references in, including dotted basenames and absolute worker
 * URLs, while ignoring unrelated property accesses.
 */

import { parseChunkReferences } from "../src/utils/chunkReferences";

describe("parseChunkReferences", () => {
  test("captures relative dynamic imports", () => {
    const code = `import("./ChatsAppComponent-BHyz_x7A.js").then(m=>m)`;
    expect(parseChunkReferences(code)).toContain(
      "ChatsAppComponent-BHyz_x7A.js"
    );
  });

  test("captures __vite__mapDeps style assets/ references", () => {
    const code = `m.f=["assets/ai-sdk-abc123.js","assets/pusher-Def456.js"]`;
    const refs = parseChunkReferences(code);
    expect(refs).toContain("ai-sdk-abc123.js");
    expect(refs).toContain("pusher-Def456.js");
  });

  test("captures chunk basenames containing dots (phosphor .es chunks)", () => {
    const code = `import("./Microphone.es-CQtd1YAP.js")`;
    expect(parseChunkReferences(code)).toContain("Microphone.es-CQtd1YAP.js");
  });

  test("captures absolute /assets worker URLs", () => {
    const code = `new Worker(new URL("/assets/spotlightSearch.worker-DWjGHsp7.js",import.meta.url),{type:"module"})`;
    expect(parseChunkReferences(code)).toContain(
      "spotlightSearch.worker-DWjGHsp7.js"
    );
  });

  test("dedupes repeated references", () => {
    const code = `import("./three-DhFDyald.js");import("./three-DhFDyald.js")`;
    const refs = parseChunkReferences(code).filter(
      (r) => r === "three-DhFDyald.js"
    );
    expect(refs.length).toBe(1);
  });

  test("ignores unrelated property accesses and bare extensions", () => {
    // `.json` props, object members, and `.js` without an assets//./ prefix
    // must not be mistaken for chunk references.
    const code = `const a=config.json;obj.jsThing();const b="manifest.json";x.jsx=1;`;
    const refs = parseChunkReferences(code);
    expect(refs.length).toBe(0);
  });

  test("returns empty for code with no chunk references", () => {
    expect(parseChunkReferences("const x = 1 + 2;")).toEqual([]);
  });

  test("captures many distinct chunks from a mixed blob", () => {
    const code = [
      `import("./IpodAppComponent-BsAssatM.js")`,
      `["assets/mermaid-GHXKKRXX-B4AIuUPb.js","assets/audio-lyfw6d6o.js"]`,
      `import("./translation-CUz50OL7.js")`,
      `new URL("/assets/SpeakerHigh.es-ChvIoNLM.js",import.meta.url)`,
    ].join(";");
    const refs = parseChunkReferences(code);
    expect(refs).toEqual(
      expect.arrayContaining([
        "IpodAppComponent-BsAssatM.js",
        "mermaid-GHXKKRXX-B4AIuUPb.js",
        "audio-lyfw6d6o.js",
        "translation-CUz50OL7.js",
        "SpeakerHigh.es-ChvIoNLM.js",
      ])
    );
  });
});
