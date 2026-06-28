/**
 * Tests for applet author trust resolution and sandbox derivation.
 *
 * Goal: only applets explicitly authored by the trusted admin (`ryo`) get
 * `allow-same-origin` and the auth bridge. Every other applet — including
 * the currently-logged-in user's own — is sandboxed without same-origin
 * so it cannot read parent localStorage / cookies / IndexedDB.
 */

import { describe, expect, test } from "bun:test";
import {
  APPLET_AI_PATH,
  APPLET_AUTH_MESSAGE_TYPE,
  AppletBridgeHost,
  createAppletAuthBridgeScript,
  getAppletSandboxAttribute,
  getServerAttestedAppletAuthor,
  isTrustedAppletAuthor,
  parseAppletAiBridgeRequest,
  TRUSTED_APPLET_AUTHOR,
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
    await Bun.sleep(10);
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
});
