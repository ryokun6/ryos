import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import {
  classifyNetworkStatus,
  clearNetworkCapture,
  formatNetworkEntriesForCopy,
  getNetworkCaptureSnapshot,
  installNetworkCapture,
  isNetworkCaptureEnabled,
  setNetworkCaptureEnabled,
  type NetworkRequestEntry,
} from "../../../src/utils/networkCapture";

const originalFetch = globalThis.fetch;

// The interceptor binds whatever `globalThis.fetch` is at install time, so we
// install it over a reconfigurable dispatcher. Tests swap `activeStub` to
// control the underlying response without replacing (and bypassing) the
// installed capture wrapper.
let activeStub: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function stubFetch(status: number): void {
  activeStub = async () => new Response(null, { status });
}

function stubFetchReject(message: string): void {
  activeStub = async () => {
    throw new Error(message);
  };
}

// Let the microtask-batched snapshot flush settle.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeAll(() => {
  activeStub = async () => new Response(null, { status: 200 });
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    activeStub(input, init)) as typeof fetch;
  installNetworkCapture();
});

afterEach(() => {
  setNetworkCaptureEnabled(false);
  clearNetworkCapture();
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe("network capture status classification", () => {
  test("buckets statuses by severity", () => {
    expect(classifyNetworkStatus(200, "success")).toBe("ok");
    expect(classifyNetworkStatus(204, "success")).toBe("ok");
    expect(classifyNetworkStatus(404, "error")).toBe("warn");
    expect(classifyNetworkStatus(429, "error")).toBe("warn");
    expect(classifyNetworkStatus(500, "error")).toBe("error");
    expect(classifyNetworkStatus(null, "error")).toBe("error");
    expect(classifyNetworkStatus(null, "pending")).toBe("pending");
  });
});

describe("network capture copy formatting", () => {
  test("renders method, status, duration, and url per line", () => {
    const entries: NetworkRequestEntry[] = [
      {
        id: 1,
        method: "GET",
        url: "/api/chat",
        startedAt: Date.UTC(2026, 5, 29, 5, 0, 0),
        durationMs: 42,
        status: 429,
        outcome: "error",
        error: null,
      },
      {
        id: 2,
        method: "POST",
        url: "/api/realtime/ticket",
        startedAt: Date.UTC(2026, 5, 29, 5, 0, 1),
        durationMs: null,
        status: null,
        outcome: "pending",
        error: null,
      },
    ];

    const text = formatNetworkEntriesForCopy(entries);
    expect(text).toContain("GET 429 42ms /api/chat");
    expect(text).toContain("POST pending /api/realtime/ticket");
  });
});

describe("network capture interception", () => {
  test("does not record while disabled", async () => {
    setNetworkCaptureEnabled(false);
    stubFetch(200);
    await globalThis.fetch("/api/songs");
    await flush();
    expect(getNetworkCaptureSnapshot()).toHaveLength(0);
    expect(isNetworkCaptureEnabled()).toBe(false);
  });

  test("records method, status, and strips query strings when enabled", async () => {
    setNetworkCaptureEnabled(true);
    stubFetch(429);
    await globalThis.fetch("/api/chat?token=secret-value");
    await flush();

    const snapshot = getNetworkCaptureSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].method).toBe("GET");
    expect(snapshot[0].status).toBe(429);
    expect(snapshot[0].outcome).toBe("error");
    expect(snapshot[0].url).toBe("/api/chat");
    expect(snapshot[0].durationMs).not.toBeNull();
  });

  test("records network-level failures with an error message", async () => {
    setNetworkCaptureEnabled(true);
    stubFetchReject("offline");
    await expect(globalThis.fetch("/api/songs")).rejects.toThrow("offline");
    await flush();

    const snapshot = getNetworkCaptureSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].status).toBeNull();
    expect(snapshot[0].outcome).toBe("error");
    expect(snapshot[0].error).toBe("offline");
  });
});
