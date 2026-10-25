/**
 * Wayback pages inside IE: link clicks must stay in the app.
 *
 * The proxy strips archive.org's wombat script, so replay hrefs are no longer
 * rewritten back to the captured site. The interceptor (and the parent message
 * parser) have to do that themselves.
 */
import { describe, expect, test } from "bun:test";
import { buildIeNavigationInterceptorScript } from "../../../api/_utils/_ie-proxy.ts";
import { parseIeFrameMessage } from "../../../src/apps/internet-explorer/utils/ieFrameMessaging.ts";
import {
  resolveArchivedNavigationUrl,
  unwrapWaybackReplayUrl,
} from "../../../src/apps/internet-explorer/utils/waybackNavigation.ts";

const BASE = "https://web.archive.org/web/20100101003440/http://www.apple.com/";
const NESTED_BASE =
  "https://web.archive.org/web/20100101003440/http://www.apple.com/dir/page.html";

describe("unwrapWaybackReplayUrl", () => {
  test("peels a replay URL down to the captured page", () => {
    expect(
      unwrapWaybackReplayUrl(
        "https://web.archive.org/web/20100101003440/http://www.apple.com/mac/"
      )
    ).toBe("http://www.apple.com/mac/");
  });

  test("peels resource modifiers and nested wrappers", () => {
    expect(
      unwrapWaybackReplayUrl(
        "https://web.archive.org/web/20100101003440im_/http://images.apple.com/a.png"
      )
    ).toBe("http://images.apple.com/a.png");
    expect(
      unwrapWaybackReplayUrl(
        "https://web.archive.org/web/20100101003440js_/https://images.apple.com/app.js"
      )
    ).toBe("https://images.apple.com/app.js");
    expect(
      unwrapWaybackReplayUrl(
        "https://web.archive.org/web/20101001/https://web.archive.org/web/20100101003440/http://www.apple.com/mac/"
      )
    ).toBe("http://www.apple.com/mac/");
  });

  test("keeps query strings and hashes on the captured URL", () => {
    expect(
      unwrapWaybackReplayUrl(
        "https://web.archive.org/web/20100101003440/http://itunes.apple.com/view?id=1&s=2#clip"
      )
    ).toBe("http://itunes.apple.com/view?id=1&s=2#clip");
  });

  test("leaves ordinary URLs and the archive site itself alone", () => {
    expect(unwrapWaybackReplayUrl("http://www.apple.com/support/")).toBe(
      "http://www.apple.com/support/"
    );
    expect(unwrapWaybackReplayUrl("https://web.archive.org/")).toBe(
      "https://web.archive.org/"
    );
    expect(unwrapWaybackReplayUrl("https://web.archive.org/about")).toBe(
      "https://web.archive.org/about"
    );
    expect(
      unwrapWaybackReplayUrl(
        "https://web-static.archive.org/_static/css/banner-styles.css"
      )
    ).toBe("https://web-static.archive.org/_static/css/banner-styles.css");
  });
});

describe("resolveArchivedNavigationUrl", () => {
  test("replay hrefs become the captured page", () => {
    expect(
      resolveArchivedNavigationUrl(
        "/web/20100101003440/http://www.apple.com/mac/",
        BASE
      )
    ).toBe("http://www.apple.com/mac/");
    expect(
      resolveArchivedNavigationUrl(
        "https://web.archive.org/web/20100101003440/http://www.apple.com/iphone/",
        BASE
      )
    ).toBe("http://www.apple.com/iphone/");
    expect(
      resolveArchivedNavigationUrl(
        "https://web.archive.org/web/20100101003440cs_/http://images.apple.com/home.css",
        BASE
      )
    ).toBe("http://images.apple.com/home.css");
  });

  test("links that are already original stay original", () => {
    expect(
      resolveArchivedNavigationUrl("http://www.apple.com/support/", BASE)
    ).toBe("http://www.apple.com/support/");
  });

  test("root-relative and relative links resolve on the archived host", () => {
    expect(resolveArchivedNavigationUrl("/about", BASE)).toBe(
      "http://www.apple.com/about"
    );
    expect(resolveArchivedNavigationUrl("about.html", BASE)).toBe(
      "http://www.apple.com/about.html"
    );
    expect(resolveArchivedNavigationUrl("../mac/", BASE)).toBe(
      "http://www.apple.com/mac/"
    );
    expect(resolveArchivedNavigationUrl("about.html", NESTED_BASE)).toBe(
      "http://www.apple.com/dir/about.html"
    );
  });

  test("in-page hashes stay on the captured page", () => {
    expect(resolveArchivedNavigationUrl("#top", BASE)).toBe(
      "http://www.apple.com/#top"
    );
  });

  test("non-wayback bases resolve normally", () => {
    expect(
      resolveArchivedNavigationUrl("/docs", "https://example.com/guide/")
    ).toBe("https://example.com/docs");
    expect(
      resolveArchivedNavigationUrl("page.html", "https://example.com/guide/")
    ).toBe("https://example.com/guide/page.html");
  });
});

describe("IE frame messages unwrap Wayback targets", () => {
  const iframeWindow = {} as Window;
  const frameId = "abcdefghijklmnop.7";

  test("iframeNavigation of a replay URL is the captured page", () => {
    expect(
      parseIeFrameMessage(
        {
          data: {
            type: "iframeNavigation",
            url: "https://web.archive.org/web/20100101003440/http://www.apple.com/mac/",
            ieFrame: frameId,
          },
          source: iframeWindow,
        },
        iframeWindow,
        frameId
      )
    ).toEqual({
      type: "iframeNavigation",
      url: "http://www.apple.com/mac/",
    });
  });

  test("ordinary navigations are unchanged", () => {
    expect(
      parseIeFrameMessage(
        {
          data: {
            type: "iframeNavigation",
            url: "https://example.com/docs",
            ieFrame: frameId,
          },
          source: iframeWindow,
        },
        iframeWindow,
        frameId
      )
    ).toEqual({ type: "iframeNavigation", url: "https://example.com/docs" });
  });
});

describe("injected navigation interceptor", () => {
  const script = buildIeNavigationInterceptorScript({
    nonce: "n0nce",
    frameToken: "abcdefghijklmnop.1",
    parentOrigin: "https://os.ryo.lu",
  });

  test("unwraps replay links before posting to the parent", () => {
    const nav = script.indexOf("function postNavigation");
    const resolveAt = script.indexOf("resolveArchivedNavigationUrl(url, base)", nav);
    const postAt = script.indexOf("url: absoluteUrl", resolveAt);
    expect(nav).toBeGreaterThan(0);
    expect(resolveAt).toBeGreaterThan(nav);
    expect(postAt).toBeGreaterThan(resolveAt);
    expect(script).toContain("WAYBACK_REPLAY_URL_RE");
    expect(script).toContain('<script nonce="n0nce">');
  });

  test("click on a replay link posts the captured URL and cancels navigation", () => {
    const messages: Array<Record<string, unknown>> = [];
    const realParent = {
      postMessage(message: Record<string, unknown>) {
        messages.push(message);
      },
    };

    const document = {
      baseURI: BASE,
      addEventListener(type: string, handler: (event: Event) => void) {
        listeners.push({ type, handler });
      },
      removeEventListener() {},
      readyState: "loading",
      title: "Apple",
      body: null,
      getElementById() {
        return null;
      },
      querySelector() {
        return null;
      },
      documentElement: {},
    };
    const listeners: Array<{ type: string; handler: (event: Event) => void }> =
      [];

    const fakeWindow = {
      parent: realParent,
      location: { href: "https://os.ryo.lu/api/iframe-check?url=1" },
      document,
      addEventListener() {},
      setTimeout() {
        return 0;
      },
      setInterval() {
        return 0;
      },
      URL,
      navigator: {},
    };
    // The interceptor aliases `window` globals. Evaluate against fakeWindow.
    const source = script
      .trim()
      .replace(/^<script[^>]*>/, "")
      .replace(/<\/script>\s*$/, "");
    const fn = new Function(
      "window",
      "document",
      "URL",
      "navigator",
      "Object",
      "Promise",
      source
    );
    const originalSetTimeout = globalThis.setTimeout;
    const originalSetInterval = globalThis.setInterval;
    const globalRecord = globalThis as unknown as {
      XMLHttpRequest?: unknown;
      history?: unknown;
    };
    const originalXhr = globalRecord.XMLHttpRequest;
    const originalHistory = globalRecord.history;
    const FakeXHR = function FakeXHR() {};
    FakeXHR.prototype.open = function open() {};
    globalRecord.XMLHttpRequest = FakeXHR;
    // The interceptor patches the page's history after registering clicks.
    // Bun's test realm has no `history` global, so supply the same shape.
    globalRecord.history = {
      pushState() {},
      replaceState() {},
    };
    globalThis.setTimeout = (() => 0) as unknown as typeof setTimeout;
    globalThis.setInterval = (() => 0) as unknown as typeof setInterval;
    try {
      fn(fakeWindow, document, URL, fakeWindow.navigator, Object, Promise);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.setInterval = originalSetInterval;
      if (originalXhr === undefined) delete globalRecord.XMLHttpRequest;
      else globalRecord.XMLHttpRequest = originalXhr;
      if (originalHistory === undefined) delete globalRecord.history;
      else globalRecord.history = originalHistory;
    }

    const anchor = {
      tagName: "A",
      href: "https://web.archive.org/web/20100101003440/http://www.apple.com/mac/",
      parentElement: document.documentElement,
      getAttribute(name: string) {
        if (name === "href") return "/web/20100101003440/http://www.apple.com/mac/";
        if (name === "target") return null;
        return null;
      },
    };
    const event = {
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      button: 0,
      target: anchor,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {},
      stopImmediatePropagation() {},
    };

    const click = listeners.find((listener) => listener.type === "click");
    expect(click).toBeDefined();
    click!.handler(event as unknown as Event);

    expect(event.defaultPrevented).toBe(true);
    expect(messages).toContainEqual(
      expect.objectContaining({
        type: "iframeNavigation",
        url: "http://www.apple.com/mac/",
        ieFrame: "abcdefghijklmnop.1",
      })
    );
  });
});
