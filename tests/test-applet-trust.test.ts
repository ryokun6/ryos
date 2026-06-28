/**
 * Tests for applet author trust resolution and sandbox derivation.
 *
 * Goal: every applet keeps an opaque origin. Only server-attested applets
 * authored by the trusted admin (`ryo`) get the narrow AI capability; applet
 * storage remains isolated from parent localStorage, cookies, and IndexedDB.
 */

import { describe, expect, test } from "bun:test";
import {
  APPLET_AI_PATH,
  APPLET_AUTH_MESSAGE_TYPE,
  AppletBridgeHost,
  createAppletAuthBridgeScript,
  createAppletStorageKey,
  getAppletSandboxAttribute,
  getServerAttestedAppletAuthor,
  injectAppletRuntime,
  isAppletAiCapabilityAllowed,
  isTrustedAppletAuthor,
  parseAppletAiBridgeRequest,
  readAppletStorageSnapshot,
  resolveAppletStorageIdentity,
  TRUSTED_APPLET_AUTHOR,
  type AppletStorageBackend,
} from "../src/utils/appletAuthBridge";
import { importAppletFile } from "../src/utils/appletImportExport";

describe("isTrustedAppletAuthor", () => {
  test("recognises the trusted admin (case-insensitive)", () => {
    expect(isTrustedAppletAuthor("ryo")).toBe(true);
    expect(isTrustedAppletAuthor("Ryo")).toBe(true);
    expect(isTrustedAppletAuthor("RYO")).toBe(true);
    expect(isTrustedAppletAuthor(" ryo ")).toBe(true);
    expect(TRUSTED_APPLET_AUTHOR).toBe("ryo");
  });

  test("rejects every other author including the local user", () => {
    expect(isTrustedAppletAuthor("alice")).toBe(false);
    expect(isTrustedAppletAuthor("bob")).toBe(false);
    expect(isTrustedAppletAuthor("ryosomething")).toBe(false);
    expect(isTrustedAppletAuthor("notryo")).toBe(false);
  });

  test("treats null / undefined / empty as untrusted", () => {
    expect(isTrustedAppletAuthor(null)).toBe(false);
    expect(isTrustedAppletAuthor(undefined)).toBe(false);
    expect(isTrustedAppletAuthor("")).toBe(false);
    expect(isTrustedAppletAuthor("   ")).toBe(false);
  });
});

describe("applet capability provenance", () => {
  test("an author string alone cannot grant the AI capability", () => {
    expect(isAppletAiCapabilityAllowed("ryo", false)).toBe(false);
    expect(isAppletAiCapabilityAllowed("ryo", true)).toBe(true);
    expect(isAppletAiCapabilityAllowed("alice", true)).toBe(false);
  });
});

describe("applet storage namespace", () => {
  test("prefers immutable VFS UUIDs and otherwise uses server share IDs", () => {
    expect(
      resolveAppletStorageIdentity({
        vfsUuid: "uuid-v1",
        serverShareId: "share-1",
      })
    ).toBe("uuid-v1");
    expect(
      resolveAppletStorageIdentity({ serverShareId: "share-1" })
    ).toBe("share-1");
  });

  test("replacement UUIDs do not inherit prior applet data", () => {
    expect(createAppletStorageKey("uuid-old")).not.toBe(
      createAppletStorageKey("uuid-replacement")
    );
  });
});

describe("applet runtime injection", () => {
  test("places the runtime before every applet-authored script", () => {
    const authored = "<html><head><script>window.authored = true</script></head></html>";
    const result = injectAppletRuntime(authored, "<script>window.runtime = true</script>");
    expect(result.indexOf("window.runtime")).toBeLessThan(
      result.indexOf("window.authored")
    );
  });
});

describe("getAppletSandboxAttribute", () => {
  test("server-attested applets still use an opaque origin", () => {
    const attr = getAppletSandboxAttribute(true);
    expect(attr.split(/\s+/)).not.toContain("allow-same-origin");
    expect(attr.split(/\s+/)).toContain("allow-scripts");
  });

  test("untrusted applets must NOT receive allow-same-origin", () => {
    const attr = getAppletSandboxAttribute(false);
    expect(attr.split(/\s+/)).not.toContain("allow-same-origin");
    // Scripts are still allowed — without scripts there is no applet.
    expect(attr.split(/\s+/)).toContain("allow-scripts");
  });
});

describe("imported applet metadata", () => {
  test("does not preserve a forged trusted author", async () => {
    const file = new File(
      [
        JSON.stringify({
          name: "forged.app",
          content: "<h1>not trusted</h1>",
          createdBy: "ryo",
        }),
      ],
      "forged.json",
      { type: "application/json" }
    );

    const imported = await importAppletFile(file);
    expect(imported.createdBy).toBeUndefined();

    const locallyAttributed = await importAppletFile(file, "alice");
    expect(locallyAttributed.createdBy).toBe("alice");
  });

  test("cannot trust local content using a forged createdBy value", () => {
    const localContent = "<script>stealSession()</script>";
    const forgedLocalMetadata = { createdBy: "ryo" };

    expect(
      getServerAttestedAppletAuthor(localContent, null)
    ).toBeNull();
    expect(isTrustedAppletAuthor(forgedLocalMetadata.createdBy)).toBe(true);
  });

  test("trusts only content matching a server attestation", () => {
    const attestation = {
      content: "<main>server applet</main>",
      createdBy: "ryo",
    };

    expect(
      getServerAttestedAppletAuthor(attestation.content, attestation)
    ).toBe("ryo");
    expect(
      getServerAttestedAppletAuthor(
        "<script>locally modified</script>",
        attestation
      )
    ).toBeNull();
  });
});

describe("applet AI parent bridge", () => {
  const request = {
    type: APPLET_AUTH_MESSAGE_TYPE,
    action: "ai-request",
    requestId: "request-1",
    request: {
      url: APPLET_AI_PATH,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"prompt":"hello"}',
    },
  };

  test("accepts only the applet AI endpoint and POST operation", () => {
    expect(parseAppletAiBridgeRequest(request)).not.toBeNull();
    expect(
      parseAppletAiBridgeRequest({
        ...request,
        request: { ...request.request, url: "/api/admin" },
      })
    ).toBeNull();
    expect(
      parseAppletAiBridgeRequest({
        ...request,
        request: { ...request.request, method: "GET" },
      })
    ).toBeNull();
    const script = createAppletAuthBridgeScript("document-capability");
    expect(script).toContain('action: "connect"');
    expect(script).toContain("new MessageChannel()");
    expect(script).toContain("port.postMessage({");
    expect(script.match(/window\.parent\.postMessage/g)).toHaveLength(1);
  });

  test("rejects a connection from an unregistered window", () => {
    let fetchCount = 0;
    const untrustedWindow = { postMessage() {} } as unknown as Window;
    const trustedWindow = { postMessage() {} } as unknown as Window;
    const host = new AppletBridgeHost(async () => {
      fetchCount += 1;
      return new Response();
    });
    host.prepareDocument("nonce");
    host.handleIframeLoad(trustedWindow);
    const channel = new MessageChannel();
    const event = new MessageEvent("message", {
      data: {
        type: APPLET_AUTH_MESSAGE_TYPE,
        action: "connect",
        nonce: "nonce",
      },
      ports: [channel.port2],
    });
    Object.defineProperty(event, "source", { value: untrustedWindow });

    expect(host.handleConnect(event)).toBe(false);
    expect(fetchCount).toBe(0);
    channel.port1.close();
    channel.port2.close();
  });

  test("rejects a registered window presenting the wrong document nonce", () => {
    const targetWindow = {} as Window;
    const host = new AppletBridgeHost();
    host.prepareDocument("expected-nonce");
    host.handleIframeLoad(targetWindow);
    const channel = new MessageChannel();
    const event = new MessageEvent("message", {
      data: {
        type: APPLET_AUTH_MESSAGE_TYPE,
        action: "connect",
        nonce: "attacker-nonce",
      },
      ports: [channel.port2],
    });
    Object.defineProperty(event, "source", { value: targetWindow });
    expect(host.handleConnect(event)).toBe(false);
    host.invalidateAll();
    channel.port1.close();
    channel.port2.close();
  });

  test("performs a credentialed fetch over the document port", async () => {
    const trustedWindow = {} as Window;
    let receivedUrl = "";
    let receivedCredentials: RequestCredentials | undefined;
    const host = new AppletBridgeHost(
      async (input, init) => {
        receivedUrl = String(input);
        receivedCredentials = init?.credentials;
        return new Response('{"text":"ok"}', {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
    );
    host.prepareDocument("nonce");
    host.handleIframeLoad(trustedWindow);
    const channel = new MessageChannel();
    const connectEvent = new MessageEvent("message", {
      data: {
        type: APPLET_AUTH_MESSAGE_TYPE,
        action: "connect",
        nonce: "nonce",
      },
      ports: [channel.port2],
    });
    Object.defineProperty(connectEvent, "source", { value: trustedWindow });
    expect(host.handleConnect(connectEvent)).toBe(true);

    const response = new Promise<Record<string, unknown>>((resolve) => {
      channel.port1.onmessage = (event) => resolve(event.data);
      channel.port1.start();
    });
    channel.port1.postMessage(request);
    const posted = await response;
    expect(receivedUrl).toBe(APPLET_AI_PATH);
    expect(receivedCredentials).toBe("include");
    expect(posted).toMatchObject({
      type: APPLET_AUTH_MESSAGE_TYPE,
      action: "ai-response",
      requestId: "request-1",
      status: 200,
    });
    host.invalidateAll();
    channel.port1.close();
  });

  test("navigation revokes the port and cannot re-authorize the WindowProxy", async () => {
    const trustedWindow = {} as Window;
    let fetchCount = 0;
    const host = new AppletBridgeHost(async () => {
      fetchCount += 1;
      return new Response('{"text":"secret"}');
    });
    host.prepareDocument("initial-srcdoc-nonce");
    host.handleIframeLoad(trustedWindow);

    const trustedChannel = new MessageChannel();
    const trustedConnect = new MessageEvent("message", {
      data: {
        type: APPLET_AUTH_MESSAGE_TYPE,
        action: "connect",
        nonce: "initial-srcdoc-nonce",
      },
      ports: [trustedChannel.port2],
    });
    Object.defineProperty(trustedConnect, "source", { value: trustedWindow });
    expect(host.handleConnect(trustedConnect)).toBe(true);

    // The WindowProxy is unchanged, but this second load is a new document.
    host.handleIframeLoad(trustedWindow);

    const attackerChannel = new MessageChannel();
    const attackerConnect = new MessageEvent("message", {
      data: {
        type: APPLET_AUTH_MESSAGE_TYPE,
        action: "connect",
        nonce: "initial-srcdoc-nonce",
      },
      ports: [attackerChannel.port2],
    });
    Object.defineProperty(attackerConnect, "source", { value: trustedWindow });
    expect(host.handleConnect(attackerConnect)).toBe(false);

    attackerChannel.port1.postMessage(request);
    await Bun.sleep(150);
    expect(fetchCount).toBe(0);
    trustedChannel.port1.close();
    attackerChannel.port1.close();
    attackerChannel.port2.close();
  });

  test("navigation aborts an in-flight fetch without returning its body", async () => {
    const trustedWindow = {} as Window;
    let releaseFetch: (() => void) | undefined;
    let fetchSignal: AbortSignal | null = null;
    const host = new AppletBridgeHost(async (_input, init) => {
      fetchSignal = init?.signal || null;
      await new Promise<void>((resolve) => {
        releaseFetch = resolve;
      });
      return new Response('{"text":"credentialed secret"}');
    });
    host.prepareDocument("nonce");
    host.handleIframeLoad(trustedWindow);

    const channel = new MessageChannel();
    const connectEvent = new MessageEvent("message", {
      data: {
        type: APPLET_AUTH_MESSAGE_TYPE,
        action: "connect",
        nonce: "nonce",
      },
      ports: [channel.port2],
    });
    Object.defineProperty(connectEvent, "source", { value: trustedWindow });
    expect(host.handleConnect(connectEvent)).toBe(true);

    let responseCount = 0;
    channel.port1.onmessage = () => {
      responseCount += 1;
    };
    channel.port1.start();
    channel.port1.postMessage(request);
    await Bun.sleep(0);
    host.handleIframeLoad(trustedWindow);
    expect(fetchSignal?.aborted).toBe(true);
    releaseFetch?.();
    await Bun.sleep(10);
    expect(responseCount).toBe(0);
    channel.port1.close();
  });

  test("loads one snapshot, batches writes, flushes on invalidation, and reloads persisted state", async () => {
    const values = new Map<string, string>();
    let getCount = 0;
    let setCount = 0;
    const storage: AppletStorageBackend = {
      getItem: (key) => {
        getCount += 1;
        return values.get(key) ?? null;
      },
      setItem: (key, value) => {
        setCount += 1;
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    };
    const storageKey = createAppletStorageKey("persistent-uuid");
    const targetWindow = {} as Window;
    const host = new AppletBridgeHost(fetch, storage);
    host.prepareDocument("nonce", storageKey, false);
    expect(getCount).toBe(1);
    host.handleIframeLoad(targetWindow);
    const channel = new MessageChannel();
    const event = new MessageEvent("message", {
      data: {
        type: APPLET_AUTH_MESSAGE_TYPE,
        action: "connect",
        nonce: "nonce",
      },
      ports: [channel.port2],
    });
    Object.defineProperty(event, "source", { value: targetWindow });
    expect(host.handleConnect(event)).toBe(true);
    channel.port1.postMessage({
      type: APPLET_AUTH_MESSAGE_TYPE,
      action: "storage-set",
      key: "one",
      value: "1",
    });
    channel.port1.postMessage({
      type: APPLET_AUTH_MESSAGE_TYPE,
      action: "storage-set",
      key: "two",
      value: "2",
    });
    await Bun.sleep(10);
    expect(getCount).toBe(1);
    expect(setCount).toBe(0);
    host.invalidateAll();
    expect(setCount).toBe(1);

    const reloaded = new AppletBridgeHost(fetch, storage);
    reloaded.prepareDocument("next", storageKey, false);
    expect(reloaded.getStorageSnapshot()).toEqual({ one: "1", two: "2" });
    expect(getCount).toBe(2);
    reloaded.invalidateAll();
    channel.port1.close();
  });

  test("does not silently lose the 129th synchronous storage mutation", async () => {
    const values = new Map<string, string>();
    const storage: AppletStorageBackend = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    };
    const storageKey = createAppletStorageKey("129-write-reproduction");
    const targetWindow = {} as Window;
    const host = new AppletBridgeHost(fetch, storage);
    host.prepareDocument("nonce", storageKey, false);
    host.handleIframeLoad(targetWindow);
    const channel = new MessageChannel();
    const event = new MessageEvent("message", {
      data: {
        type: APPLET_AUTH_MESSAGE_TYPE,
        action: "connect",
        nonce: "nonce",
      },
      ports: [channel.port2],
    });
    Object.defineProperty(event, "source", { value: targetWindow });
    expect(host.handleConnect(event)).toBe(true);

    channel.port1.postMessage({
      type: APPLET_AUTH_MESSAGE_TYPE,
      action: "storage-snapshot",
      snapshot: Object.fromEntries(
        Array.from({ length: 129 }, (_, index) => [`key-${index}`, "x"])
      ),
    });
    await Bun.sleep(150);

    expect(Object.keys(readAppletStorageSnapshot(storageKey, storage))).toHaveLength(
      129
    );
    host.invalidateAll();
    channel.port1.close();
  });

  test("acknowledges a persisted snapshot revision after applying it", async () => {
    const values = new Map<string, string>();
    const storage: AppletStorageBackend = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    };
    const storageKey = createAppletStorageKey("acknowledgement-test");
    const targetWindow = {} as Window;
    const host = new AppletBridgeHost(fetch, storage);
    host.prepareDocument("nonce", storageKey, false);
    host.handleIframeLoad(targetWindow);
    const channel = new MessageChannel();
    const event = new MessageEvent("message", {
      data: {
        type: APPLET_AUTH_MESSAGE_TYPE,
        action: "connect",
        nonce: "nonce",
      },
      ports: [channel.port2],
    });
    Object.defineProperty(event, "source", { value: targetWindow });
    expect(host.handleConnect(event)).toBe(true);

    const acknowledgement = new Promise<unknown>((resolve) => {
      channel.port1.onmessage = (portEvent) => resolve(portEvent.data);
      channel.port1.start();
    });
    channel.port1.postMessage({
      type: APPLET_AUTH_MESSAGE_TYPE,
      action: "storage-snapshot",
      revision: 42,
      snapshot: { latest: "authoritative" },
    });

    expect(await acknowledgement).toEqual({
      type: APPLET_AUTH_MESSAGE_TYPE,
      action: "storage-ack",
      revision: 42,
    });
    expect(host.getStorageSnapshot()).toEqual({ latest: "authoritative" });
    host.invalidateAll();
    channel.port1.close();
  });

  test("replacement document derives its snapshot from pending authoritative state", async () => {
    const values = new Map<string, string>();
    const storage: AppletStorageBackend = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    };
    const storageKey = createAppletStorageKey("replacement-reproduction");
    const targetWindow = {} as Window;
    const host = new AppletBridgeHost(fetch, storage);
    host.prepareDocument("first", storageKey, false);
    host.handleIframeLoad(targetWindow);
    const channel = new MessageChannel();
    const event = new MessageEvent("message", {
      data: {
        type: APPLET_AUTH_MESSAGE_TYPE,
        action: "connect",
        nonce: "first",
      },
      ports: [channel.port2],
    });
    Object.defineProperty(event, "source", { value: targetWindow });
    expect(host.handleConnect(event)).toBe(true);

    channel.port1.postMessage({
      type: APPLET_AUTH_MESSAGE_TYPE,
      action: "storage-set",
      key: "latest",
      value: "authoritative",
    });
    await Bun.sleep(0);
    const staleRenderSnapshot = readAppletStorageSnapshot(storageKey, storage);
    expect(staleRenderSnapshot).toEqual({});
    host.prepareDocument("second", storageKey, false, staleRenderSnapshot);

    expect(host.getStorageSnapshot()).toEqual({ latest: "authoritative" });
    host.invalidateAll();
    channel.port1.close();
  });

  test("rate-limits message floods before repeated persistence work", async () => {
    const values = new Map<string, string>();
    let setCount = 0;
    const storage: AppletStorageBackend = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        setCount += 1;
        values.set(key, value);
      },
      removeItem: (key) => values.delete(key),
    };
    const storageKey = createAppletStorageKey("flood-test");
    const targetWindow = {} as Window;
    const host = new AppletBridgeHost(fetch, storage);
    host.prepareDocument("nonce", storageKey, false);
    host.handleIframeLoad(targetWindow);
    const channel = new MessageChannel();
    const event = new MessageEvent("message", {
      data: {
        type: APPLET_AUTH_MESSAGE_TYPE,
        action: "connect",
        nonce: "nonce",
      },
      ports: [channel.port2],
    });
    Object.defineProperty(event, "source", { value: targetWindow });
    expect(host.handleConnect(event)).toBe(true);
    for (let index = 0; index < 400; index += 1) {
      channel.port1.postMessage({
        type: APPLET_AUTH_MESSAGE_TYPE,
        action: "storage-set",
        key: `key-${index}`,
        value: "x",
      });
    }
    await Bun.sleep(150);
    const persisted = readAppletStorageSnapshot(storageKey, storage);
    expect(Object.keys(persisted)).toHaveLength(128);
    expect(setCount).toBe(1);
    host.invalidateAll();
    channel.port1.close();
  });

  test("persists bounded applet storage over the document port without enabling AI", async () => {
    const values = new Map<string, string>();
    const storage: AppletStorageBackend = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    };
    const storageKey = createAppletStorageKey("/Applets/Weather.app");
    const trustedWindow = {} as Window;
    let fetchCount = 0;
    const host = new AppletBridgeHost(async () => {
      fetchCount += 1;
      return new Response();
    }, storage);
    host.prepareDocument("nonce", storageKey, false);
    host.handleIframeLoad(trustedWindow);

    const channel = new MessageChannel();
    const connectEvent = new MessageEvent("message", {
      data: {
        type: APPLET_AUTH_MESSAGE_TYPE,
        action: "connect",
        nonce: "nonce",
      },
      ports: [channel.port2],
    });
    Object.defineProperty(connectEvent, "source", { value: trustedWindow });
    expect(host.handleConnect(connectEvent)).toBe(true);

    channel.port1.postMessage({
      type: APPLET_AUTH_MESSAGE_TYPE,
      action: "storage-set",
      key: "weatherUnit",
      value: "C",
    });
    channel.port1.postMessage(request);
    await Bun.sleep(150);

    expect(readAppletStorageSnapshot(storageKey, storage)).toEqual({
      weatherUnit: "C",
    });
    expect(fetchCount).toBe(0);
    host.invalidateAll();
    channel.port1.close();
  });

  test("explicitly re-arms a WindowProxy for its assigned srcdoc load", () => {
    const targetWindow = {} as Window;
    const host = new AppletBridgeHost();
    host.prepareDocument("nonce");
    host.handleIframeLoad(targetWindow);
    host.armWindowForDocument(targetWindow);
    host.handleIframeLoad(targetWindow);

    const channel = new MessageChannel();
    const event = new MessageEvent("message", {
      data: {
        type: APPLET_AUTH_MESSAGE_TYPE,
        action: "connect",
        nonce: "nonce",
      },
      ports: [channel.port2],
    });
    Object.defineProperty(event, "source", { value: targetWindow });
    expect(host.handleConnect(event)).toBe(true);
    host.invalidateAll();
    channel.port1.close();
  });
});
