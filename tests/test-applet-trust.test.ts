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
  APPLET_AUTH_BRIDGE_SCRIPT,
  APPLET_AUTH_MESSAGE_TYPE,
  getAppletSandboxAttribute,
  getServerAttestedAppletAuthor,
  handleAppletBridgeMessage,
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
    expect(APPLET_AUTH_BRIDGE_SCRIPT).toContain(
      'window.parent.postMessage({'
    );
    expect(APPLET_AUTH_BRIDGE_SCRIPT).toContain('action: "ai-request"');
  });

  test("rejects a valid-looking request from an unregistered window", async () => {
    let fetchCount = 0;
    const untrustedWindow = { postMessage() {} } as unknown as Window;
    const trustedWindow = { postMessage() {} } as unknown as Window;
    const event = new MessageEvent("message", { data: request });
    Object.defineProperty(event, "source", { value: untrustedWindow });

    const handled = await handleAppletBridgeMessage({
      event,
      trustedWindows: [trustedWindow],
      fetchImpl: async () => {
        fetchCount += 1;
        return new Response();
      },
    });

    expect(handled).toBe(false);
    expect(fetchCount).toBe(0);
  });

  test("performs a credentialed fetch for a registered iframe", async () => {
    const posted: unknown[] = [];
    const trustedWindow = {
      postMessage(message: unknown) {
        posted.push(message);
      },
    } as unknown as Window;
    const event = new MessageEvent("message", { data: request });
    Object.defineProperty(event, "source", { value: trustedWindow });
    let receivedUrl = "";
    let receivedCredentials: RequestCredentials | undefined;

    const handled = await handleAppletBridgeMessage({
      event,
      trustedWindows: [trustedWindow],
      fetchImpl: async (input, init) => {
        receivedUrl = String(input);
        receivedCredentials = init?.credentials;
        return new Response('{"text":"ok"}', {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    expect(handled).toBe(true);
    expect(receivedUrl).toBe(APPLET_AI_PATH);
    expect(receivedCredentials).toBe("include");
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      type: APPLET_AUTH_MESSAGE_TYPE,
      action: "ai-response",
      requestId: "request-1",
      status: 200,
    });
  });
});
