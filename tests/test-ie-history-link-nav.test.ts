import "./local-storage-stub";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { useInternetExplorerStore } from "../src/stores/useInternetExplorerStore";

/**
 * Unit tests for Internet Explorer history tracking, focused on link
 * navigation via the proxy iframe.
 *
 * Bugs covered:
 *  1. After a Back/Forward traversal (`isNavigatingHistory === true`), a link
 *     click inside the proxied page must record the destination in history.
 *     The fix clears `isNavigatingHistory` for iframe/AI link navigations
 *     before calling `handleNavigate`, so `loadSuccess` records the page.
 *  2. Navigating to a new page while "backed up" must truncate the forward
 *     stack, mirroring real browser behavior.
 *
 * These exercise the store directly. The IE logic hook is what flips
 * `isNavigatingHistory` to false for link clicks; here we simulate that exact
 * sequence (setNavigatingHistory(false) + loadSuccess with addToHistory).
 */

// Avoid real network calls from fetchCachedYears triggered by loadSuccess.
const originalFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ years: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = originalFetch;
});

const store = useInternetExplorerStore;

function resetHistory() {
  store.setState({ history: [], historyIndex: -1, isNavigatingHistory: false });
}

// Simulate a fresh navigation that successfully loads (URL bar / link click).
function navigateTo(url: string, year = "current") {
  store.getState().setNavigatingHistory(false);
  store.getState().loadSuccess({
    title: url,
    targetUrl: url,
    targetYear: year,
    addToHistory: true,
  });
}

// Simulate pressing Back/Forward to land on an existing entry at `index`.
// Mirrors handleGoBack/handleGoForward + handleIframeLoad in the hook, where
// addToHistory = !isNavigatingHistory (so false during traversal).
function traverseTo(index: number) {
  const { history } = store.getState();
  const entry = history[index];
  store.getState().setNavigatingHistory(true);
  store.getState().setHistoryIndex(index);
  store.getState().loadSuccess({
    title: entry.title,
    targetUrl: entry.url,
    targetYear: entry.year,
    addToHistory: false,
  });
}

const urls = (entries: { url: string }[]) => entries.map((e) => e.url);

describe("IE history — link navigation after Back/Forward", () => {
  beforeEach(() => {
    resetHistory();
  });

  test("records a new page when clicking a link after going Back", () => {
    navigateTo("a.com");
    navigateTo("b.com");
    // history: [b, a], index 0
    expect(urls(store.getState().history)).toEqual(["b.com", "a.com"]);

    traverseTo(1); // Back to a.com
    expect(store.getState().historyIndex).toBe(1);
    expect(store.getState().isNavigatingHistory).toBe(true);

    // Link click inside a.com -> the hook clears isNavigatingHistory, then nav.
    navigateTo("c.com");

    // c is recorded; forward entry (b) is dropped.
    expect(urls(store.getState().history)).toEqual(["c.com", "a.com"]);
    expect(store.getState().historyIndex).toBe(0);
    expect(store.getState().isNavigatingHistory).toBe(false);
  });

  test("truncates the forward stack when navigating from a back position", () => {
    navigateTo("a.com");
    navigateTo("b.com");
    navigateTo("c.com");
    // history: [c, b, a], index 0

    traverseTo(1); // Back to b
    traverseTo(2); // Back to a
    expect(store.getState().historyIndex).toBe(2);

    navigateTo("d.com");

    // Forward stack [c, b] discarded; only [d, a] remains.
    expect(urls(store.getState().history)).toEqual(["d.com", "a.com"]);
    expect(store.getState().historyIndex).toBe(0);
  });

  test("Back/Forward traversal alone does not add history entries", () => {
    navigateTo("a.com");
    navigateTo("b.com");
    const before = urls(store.getState().history);

    traverseTo(1); // Back
    traverseTo(0); // Forward

    expect(urls(store.getState().history)).toEqual(before);
  });
});

describe("IE history — duplicate / reload handling", () => {
  beforeEach(() => {
    resetHistory();
  });

  test("re-navigating to the current page does not add a duplicate", () => {
    navigateTo("a.com");
    navigateTo("a.com");
    expect(urls(store.getState().history)).toEqual(["a.com"]);
    expect(store.getState().historyIndex).toBe(0);
  });

  test("same URL across different years is kept as separate entries", () => {
    navigateTo("a.com", "current");
    navigateTo("a.com", "1999");
    expect(store.getState().history.length).toBe(2);
    expect(store.getState().history[0].year).toBe("1999");
  });
});

describe("IE history — error navigation truncates forward stack", () => {
  beforeEach(() => {
    resetHistory();
  });

  test("errored navigation from a back position drops forward entries", () => {
    navigateTo("a.com");
    navigateTo("b.com");
    navigateTo("c.com");

    traverseTo(1);
    traverseTo(2); // at a.com, index 2

    store.getState().setNavigatingHistory(false);
    store.getState().handleNavigationError(
      {
        error: true,
        type: "connection_error",
        status: 404,
        message: "Cannot access bad.com.",
      },
      "bad.com"
    );

    expect(urls(store.getState().history)).toEqual(["bad.com", "a.com"]);
    expect(store.getState().historyIndex).toBe(0);
  });
});
