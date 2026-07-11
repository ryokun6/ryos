import { afterEach, describe, expect, mock, test } from "bun:test";
import { uploadAIConversationImage } from "../../../src/api/aiConversations.js";

type MockXhrInstance = {
  open: ReturnType<typeof mock>;
  setRequestHeader: ReturnType<typeof mock>;
  send: ReturnType<typeof mock>;
  abort: ReturnType<typeof mock>;
  upload: { onprogress: ((event: ProgressEvent) => void) | null };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  ontimeout: (() => void) | null;
  onabort: (() => void) | null;
  status: number;
  statusText: string;
  responseText: string;
  withCredentials: boolean;
  timeout: number;
  responseType: string;
  getResponseHeader: (name: string) => string | null;
};

const xhrInstances: MockXhrInstance[] = [];
const OriginalXHR = globalThis.XMLHttpRequest;

function installMockXhr() {
  xhrInstances.length = 0;
  // @ts-expect-error test double
  globalThis.XMLHttpRequest = class {
    open = mock(() => {});
    setRequestHeader = mock(() => {});
    send = mock(() => {});
    abort = mock(() => {
      this.onabort?.();
    });
    upload = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    onabort: (() => void) | null = null;
    status = 201;
    statusText = "Created";
    responseText = JSON.stringify({
      mediaType: "image/png",
      url: "/api/ai/attachments/att_test",
    });
    withCredentials = false;
    timeout = 0;
    responseType = "";
    getResponseHeader = () => "application/json";

    constructor() {
      xhrInstances.push(this as unknown as MockXhrInstance);
    }
  };
}

afterEach(() => {
  globalThis.XMLHttpRequest = OriginalXHR;
  xhrInstances.length = 0;
});

async function waitForXhr(): Promise<MockXhrInstance> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (xhrInstances.length > 0) {
      return xhrInstances[0];
    }
    await Promise.resolve();
  }
  throw new Error("XMLHttpRequest was never constructed");
}

describe("uploadAIConversationImage progress", () => {
  test("reports upload progress and returns the attachment URL", async () => {
    installMockXhr();
    const progressEvents: number[] = [];
    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

    const uploadPromise = uploadAIConversationImage(tinyPng, {
      onProgress: (progress) => {
        progressEvents.push(progress.percentage);
      },
    });

    const xhr = await waitForXhr();
    expect(xhr.withCredentials).toBe(true);
    expect(xhr.open.mock.calls[0]?.[0]).toBe("POST");
    expect(String(xhr.open.mock.calls[0]?.[1])).toContain(
      "/api/ai/attachments"
    );

    xhr.upload.onprogress?.({
      lengthComputable: true,
      loaded: 50,
      total: 100,
    } as ProgressEvent);
    xhr.onload?.();

    const result = await uploadPromise;
    expect(result.mediaType).toBe("image/png");
    expect(result.url).toContain("/api/ai/attachments/att_test");
    expect(progressEvents[0]).toBe(0);
    expect(progressEvents).toContain(50);
  });

  test("aborts in-flight uploads when the signal fires", async () => {
    installMockXhr();
    const controller = new AbortController();
    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

    const uploadPromise = uploadAIConversationImage(tinyPng, {
      signal: controller.signal,
    });
    const xhr = await waitForXhr();

    controller.abort();
    await expect(uploadPromise).rejects.toMatchObject({ name: "AbortError" });
    expect(xhr.abort).toHaveBeenCalled();
  });
});
