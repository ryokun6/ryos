import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium, type Browser } from "playwright";
import { generateProcessedHtmlContent } from "../src/components/shared/html-preview/generateProcessedHtmlContent";
import {
  createAppletAuthBridgeScript,
  createAppletBridgeNonce,
  getAppletSandboxAttribute,
  injectAppletRuntime,
} from "../src/utils/appletAuthBridge";

describe("opaque applet runtime compatibility", () => {
  let browser: Browser;
  let server: ReturnType<typeof Bun.serve>;
  let origin = "";

  beforeAll(async () => {
    server = Bun.serve({
      port: 0,
      fetch(request) {
        const { pathname } = new URL(request.url);
        if (pathname === "/external.js") {
          return new Response(
            `document.querySelector("#external").textContent = "external-ran";
             parent.postMessage({ type: "diagnostic", signal: "external", origin: location.origin }, "*");`,
            { headers: { "content-type": "text/javascript" } }
          );
        }
        if (pathname === "/relative-data") {
          return Response.json({ ok: true });
        }
        return new Response("<!doctype html><title>Applet diagnostic host</title>", {
          headers: { "content-type": "text/html" },
        });
      },
    });
    origin = `http://127.0.0.1:${server.port}`;
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser?.close();
    server?.stop(true);
  });

  test("opaque srcdoc executes inline/external scripts and exposes bridge lifecycle", async () => {
    const sandbox = getAppletSandboxAttribute(false);

    const html = generateProcessedHtmlContent({
      htmlContent: `<main>
        <output id="inline">pending</output>
        <output id="external">pending</output>
        <script>
          document.querySelector("#inline").textContent = "inline-ran";
          parent.postMessage({ type: "diagnostic", signal: "inline", origin: location.origin }, "*");
        </script>
        <script src="/external.js"></script>
      </main>`,
      contentTimestamp: 1,
      normalizedBaseUrl: `${origin}/`,
      isMacOsXTheme: false,
      isTrustedApplet: false,
      appletBridgeNonce: createAppletBridgeNonce(),
      appletStorageSnapshot: { probe: "seeded" },
      useFallbackFonts: false,
    });

    const page = await browser.newPage();
    const externalRequests: Array<{ url: string; resourceType: string }> = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/external.js")) {
        externalRequests.push({
          url: request.url(),
          resourceType: request.resourceType(),
        });
      }
    });
    await page.goto(origin);
    const result = await page.evaluate(
      ({ sandbox, html }) =>
        new Promise<{
          signals: Array<{ signal: string; origin: string }>;
          loadCount: number;
          inlineText: string | null;
          externalText: string | null;
          readableDocument: boolean;
        }>((resolve) => {
          const signals: Array<{ signal: string; origin: string }> = [];
          const iframe = document.createElement("iframe");
          iframe.setAttribute("sandbox", sandbox);
          let loadCount = 0;
          window.addEventListener("message", (event) => {
            if (event.data?.type === "diagnostic") signals.push(event.data);
          });
          iframe.addEventListener("load", () => {
            loadCount += 1;
            if (signals.length < 2) return;
            let inlineText: string | null = null;
            let externalText: string | null = null;
            let readableDocument = true;
            try {
              inlineText = iframe.contentDocument?.querySelector("#inline")?.textContent ?? null;
              externalText =
                iframe.contentDocument?.querySelector("#external")?.textContent ?? null;
            } catch {
              readableDocument = false;
            }
            resolve({
              signals,
              loadCount,
              inlineText,
              externalText,
              readableDocument,
            });
          });
          document.body.append(iframe);
          requestAnimationFrame(() => {
            iframe.srcdoc = html;
          });
        }),
      { sandbox, html }
    );

    const trustedNonce = createAppletBridgeNonce();
    const trustedHtml = generateProcessedHtmlContent({
      htmlContent:
        '<script>parent.postMessage({type:"diagnostic",signal:"trusted-inline",origin:location.origin},"*")</script>',
      contentTimestamp: 2,
      normalizedBaseUrl: `${origin}/`,
      isMacOsXTheme: false,
      isTrustedApplet: true,
      appletBridgeNonce: trustedNonce,
      useFallbackFonts: false,
    });
    const bridgeResult = await page.evaluate(
      ({ sandbox, trustedHtml, trustedNonce }) =>
        new Promise<{
          connectCount: number;
          trustedInlineCount: number;
          connectNonceMatches: boolean;
          transferredPorts: number;
          loadCount: number;
          order: string[];
        }>((resolve) => {
          const iframe = document.createElement("iframe");
          iframe.setAttribute("sandbox", sandbox);
          iframe.srcdoc = trustedHtml;
          let connectCount = 0;
          let trustedInlineCount = 0;
          let connectNonceMatches = false;
          let transferredPorts = 0;
          let loadCount = 0;
          const order: string[] = [];
          const finish = () => {
            if (!connectCount || !trustedInlineCount || !loadCount) return;
            resolve({
              connectCount,
              trustedInlineCount,
              connectNonceMatches,
              transferredPorts,
              loadCount,
              order,
            });
          };
          window.addEventListener("message", (event) => {
            if (event.source !== iframe.contentWindow) return;
            if (event.data?.signal === "trusted-inline") trustedInlineCount += 1;
            if (event.data?.action === "connect") {
              order.push("connect");
              connectCount += 1;
              connectNonceMatches = event.data.nonce === trustedNonce;
              transferredPorts = event.ports.length;
            }
            finish();
          });
          iframe.addEventListener("load", () => {
            order.push("load");
            loadCount += 1;
            finish();
          });
          document.body.append(iframe);
        }),
      { sandbox, trustedHtml, trustedNonce }
    );

    expect(sandbox).toContain("allow-scripts");
    expect(sandbox).not.toContain("allow-same-origin");
    expect(result.signals.map(({ signal }) => signal).sort()).toEqual([
      "external",
      "inline",
    ]);
    expect(result.signals.every(({ origin }) => origin === "null")).toBe(true);
    expect(externalRequests).toHaveLength(1);
    expect(bridgeResult).toMatchObject({
      connectCount: 1,
      trustedInlineCount: 1,
      connectNonceMatches: true,
      transferredPorts: 1,
    });
    expect(bridgeResult.order.indexOf("load")).toBeLessThan(
      bridgeResult.order.indexOf("connect")
    );

    const batchNonce = createAppletBridgeNonce();
    const batchHtml = injectAppletRuntime(
      `<script>
        for (var index = 0; index < 129; index += 1) {
          localStorage.setItem("key-" + index, "x");
        }
      </script>`,
      createAppletAuthBridgeScript(batchNonce, {}, false)
    );
    const storageBatch = await page.evaluate(
      ({ sandbox, batchHtml, batchNonce }) =>
        new Promise<{
          messageCount: number;
          entryCount: number;
        }>((resolve) => {
          const iframe = document.createElement("iframe");
          iframe.setAttribute("sandbox", sandbox);
          let messageCount = 0;
          window.addEventListener("message", (event) => {
            if (
              event.source !== iframe.contentWindow ||
              event.data?.action !== "connect" ||
              event.data?.nonce !== batchNonce ||
              event.ports.length !== 1
            ) {
              return;
            }
            const port = event.ports[0];
            port.onmessage = (portEvent) => {
              if (portEvent.data?.action !== "storage-snapshot") return;
              messageCount += 1;
              port.postMessage({
                type: portEvent.data.type,
                action: "storage-ack",
                revision: portEvent.data.revision,
              });
              resolve({
                messageCount,
                entryCount: Object.keys(portEvent.data.snapshot).length,
              });
            };
            port.start();
          });
          iframe.srcdoc = batchHtml;
          document.body.append(iframe);
        }),
      { sandbox, batchHtml, batchNonce }
    );
    expect(storageBatch).toEqual({ messageCount: 1, entryCount: 129 });

    const compatibilityHtml = generateProcessedHtmlContent({
      htmlContent: `<script>
        window.addEventListener("error", function (event) {
          parent.postMessage({ type: "compatibility", api: "uncaught", outcome: event.error && event.error.name, message: event.message }, "*");
        });
        ["localStorage", "sessionStorage", "indexedDB", "cookie", "parentDocument"].forEach(function (api) {
          try {
            var value;
            if (api === "localStorage") value = localStorage.getItem("probe");
            if (api === "sessionStorage") value = sessionStorage.getItem("probe");
            if (api === "indexedDB") value = indexedDB.open("probe");
            if (api === "cookie") value = document.cookie;
            if (api === "parentDocument") value = parent.document;
            parent.postMessage({ type: "compatibility", api: api, outcome: "ok", valueType: typeof value }, "*");
          } catch (error) {
            parent.postMessage({ type: "compatibility", api: api, outcome: error.name, message: error.message }, "*");
          }
        });
        localStorage.setItem("written", "yes");
        parent.postMessage({ type: "compatibility", api: "localStorageWrite", outcome: localStorage.getItem("written") }, "*");
        localStorage.propertyWrite = "property-value";
        parent.postMessage({ type: "compatibility", api: "propertyApi", outcome: localStorage.propertyWrite, enumerable: Object.keys(localStorage).includes("propertyWrite") }, "*");
        delete localStorage.propertyWrite;
        try {
          localStorage.setItem("oversized", "x".repeat(${256 * 1024 + 1}));
          parent.postMessage({ type: "compatibility", api: "valueQuota", outcome: "missed" }, "*");
        } catch (error) {
          parent.postMessage({ type: "compatibility", api: "valueQuota", outcome: error.name, unchanged: localStorage.getItem("oversized") === null }, "*");
        }
        while (localStorage.length < 256) localStorage.setItem("fill-" + localStorage.length, "x");
        try {
          localStorage.setItem("entry-overflow", "x");
          parent.postMessage({ type: "compatibility", api: "entryQuota", outcome: "missed" }, "*");
        } catch (error) {
          parent.postMessage({ type: "compatibility", api: "entryQuota", outcome: error.name, length: localStorage.length }, "*");
        }
        localStorage.clear();
        try {
          localStorage.setItem("k".repeat(257), "x");
          parent.postMessage({ type: "compatibility", api: "keyQuota", outcome: "missed" }, "*");
        } catch (error) {
          parent.postMessage({ type: "compatibility", api: "keyQuota", outcome: error.name, length: localStorage.length }, "*");
        }
        for (var quotaIndex = 0; quotaIndex < 4; quotaIndex += 1) {
          localStorage.setItem("total-" + quotaIndex, "x".repeat(220000));
        }
        try {
          localStorage.setItem("total-overflow", "x".repeat(220000));
          parent.postMessage({ type: "compatibility", api: "totalQuota", outcome: "missed" }, "*");
        } catch (error) {
          parent.postMessage({ type: "compatibility", api: "totalQuota", outcome: error.name, unchanged: localStorage.getItem("total-overflow") === null }, "*");
        }
        fetch("/relative-data")
          .then(function (response) { return response.json(); })
          .then(function (data) { parent.postMessage({ type: "compatibility", api: "relativeFetch", outcome: data.ok ? "ok" : "bad-data" }, "*"); })
          .catch(function (error) { parent.postMessage({ type: "compatibility", api: "relativeFetch", outcome: error.name, message: error.message }, "*"); });
      </script>
      <script>
        localStorage.getItem("unguarded");
        parent.postMessage({ type: "compatibility", api: "unguardedContinuation", outcome: "ok" }, "*");
      </script>`,
      contentTimestamp: 3,
      normalizedBaseUrl: `${origin}/`,
      isMacOsXTheme: false,
      isTrustedApplet: false,
      appletBridgeNonce: createAppletBridgeNonce(),
      appletStorageSnapshot: { probe: "seeded" },
      useFallbackFonts: false,
    });
    const compatibility = await page.evaluate(
      ({ sandbox, compatibilityHtml }) =>
        new Promise<Array<Record<string, unknown>>>((resolve) => {
          const results: Array<Record<string, unknown>> = [];
          const expected = new Set([
            "localStorage",
            "sessionStorage",
            "indexedDB",
            "cookie",
            "parentDocument",
            "localStorageWrite",
            "propertyApi",
            "valueQuota",
            "entryQuota",
            "keyQuota",
            "totalQuota",
            "relativeFetch",
            "unguardedContinuation",
          ]);
          const iframe = document.createElement("iframe");
          iframe.setAttribute("sandbox", sandbox);
          window.addEventListener("message", (event) => {
            if (event.source !== iframe.contentWindow) return;
            if (event.data?.type !== "compatibility") return;
            results.push(event.data);
            expected.delete(event.data.api);
            if (expected.size === 0) resolve(results);
          });
          iframe.srcdoc = compatibilityHtml;
          document.body.append(iframe);
        }),
      { sandbox, compatibilityHtml }
    );
    const outcomes = Object.fromEntries(
      compatibility.map((entry) => [entry.api, entry])
    );
    expect(outcomes.localStorage).toMatchObject({
      outcome: "ok",
      valueType: "string",
    });
    expect(outcomes.localStorageWrite).toMatchObject({ outcome: "yes" });
    expect(outcomes.propertyApi).toMatchObject({
      outcome: "property-value",
      enumerable: true,
    });
    expect(outcomes.valueQuota).toMatchObject({
      outcome: "QuotaExceededError",
      unchanged: true,
    });
    expect(outcomes.entryQuota).toMatchObject({
      outcome: "QuotaExceededError",
      length: 256,
    });
    expect(outcomes.keyQuota).toMatchObject({
      outcome: "QuotaExceededError",
      length: 0,
    });
    expect(outcomes.totalQuota).toMatchObject({
      outcome: "QuotaExceededError",
      unchanged: true,
    });
    expect(outcomes.sessionStorage).toMatchObject({ outcome: "ok" });
    expect(outcomes.cookie).toMatchObject({ outcome: "ok" });
    expect(outcomes.unguardedContinuation).toMatchObject({ outcome: "ok" });
    expect(outcomes.indexedDB).toMatchObject({ outcome: "SecurityError" });
    expect(outcomes.parentDocument).toMatchObject({ outcome: "SecurityError" });
    expect(outcomes.relativeFetch).toMatchObject({ outcome: "TypeError" });
    expect(outcomes.uncaught).toBeUndefined();
    await page.close();
  }, 15_000);

  test("retries an unacknowledged snapshot and delivers the latest write with bounded backpressure", async () => {
    const sandbox = getAppletSandboxAttribute(false);
    const nonce = createAppletBridgeNonce();
    const html = injectAppletRuntime(
      `<script>
        (async function () {
          for (var index = 0; index < 129; index += 1) {
            localStorage.setItem("latest", String(index));
            await Promise.resolve();
          }
        })();
      </script>`,
      createAppletAuthBridgeScript(nonce, {}, false)
    );
    const page = await browser.newPage();
    await page.goto(origin);
    const result = await page.evaluate(
      ({ sandbox, html, nonce }) =>
        new Promise<{
          received: number;
          applied: number;
          latest: string | null;
          finalAttempts: number;
          maxUnacknowledged: number;
        }>(
          (resolve) => {
            const iframe = document.createElement("iframe");
            iframe.setAttribute("sandbox", sandbox);
            let received = 0;
            let applied = 0;
            let latest: string | null = null;
            let finalAttempts = 0;
            const unacknowledged = new Set<number>();
            let maxUnacknowledged = 0;
            window.addEventListener("message", (event) => {
              if (
                event.source !== iframe.contentWindow ||
                event.data?.action !== "connect" ||
                event.data?.nonce !== nonce ||
                event.ports.length !== 1
              ) {
                return;
              }
              const port = event.ports[0];
              port.onmessage = (portEvent) => {
                if (portEvent.data?.action !== "storage-snapshot") return;
                received += 1;
                unacknowledged.add(portEvent.data.revision);
                maxUnacknowledged = Math.max(
                  maxUnacknowledged,
                  unacknowledged.size
                );
                if (portEvent.data.snapshot.latest === "128") {
                  finalAttempts += 1;
                  if (finalAttempts === 1) return;
                }
                applied += 1;
                latest = portEvent.data.snapshot.latest;
                port.postMessage({
                  type: portEvent.data.type,
                  action: "storage-ack",
                  revision: portEvent.data.revision,
                });
                unacknowledged.delete(portEvent.data.revision);
                if (latest === "128") {
                  resolve({
                    received,
                    applied,
                    latest,
                    finalAttempts,
                    maxUnacknowledged,
                  });
                }
              };
              port.start();
            });
            iframe.srcdoc = html;
            document.body.append(iframe);
          }
        ),
      { sandbox, html, nonce }
    );

    expect(result).toMatchObject({
      latest: "128",
      finalAttempts: 2,
      maxUnacknowledged: 1,
    });
    expect(result.received).toBeLessThanOrEqual(3);
    expect(result.applied).toBeLessThanOrEqual(2);
    await page.close();
  }, 15_000);
});
