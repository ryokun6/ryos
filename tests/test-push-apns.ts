#!/usr/bin/env bun
/**
 * Tests for APNs HTTP/2 helper
 * Verifies request formatting, success handling, and stale-token errors.
 */

import { generateKeyPairSync } from "node:crypto";
import { constants, createSecureServer, type IncomingHttpHeaders } from "node:http2";
import type { AddressInfo } from "node:net";
import type { ApnsConfig } from "../_api/_utils/_push-apns";
import {
  getApnsConfigFromEnv,
  getMissingApnsEnvVars,
  sendApnsAlert,
} from "../_api/_utils/_push-apns";
import {
  assert,
  assertEq,
  clearResults,
  printSummary,
  runTest,
  section,
} from "./test-utils";

const TEST_CERT = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIUZ42tWoUsuaAyHOjuWmejlYJXZwkwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDIwNzIwMjcyMFoXDTI2MDIw
ODIwMjcyMFowFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEArk1E14fePigM954/lOTuQpknLEKHXUXKmExq0b6z/ije
pt7Vdxo6DGHuXHswIgNTk4aG4f2y0kZREr7lc/GMuPgnL1bQ3PXveCsxwZbyPiAz
C0QvQYeJ3b8Z+3kpCtAopdKGR23x2Jyg3OswCWfEufZ3sDWJHO9Wwg1GO+4yZMcg
uJyZfYJm8nRshKvG90Jw3lCSdIUyK8Vr/o57QEOlTMzb2hl0jGqiZ/7w1elwK+CA
dTVdKbKxdJExbZ/1kOrdbxpYJI9BDRiuMHQlgJ+3B7hckpFS+B8i39cFJEI10Qj9
pt08LhxhpsV7JSKWvJe2nIPGKDS2vrmGUP6EykfdOwIDAQABo1MwUTAdBgNVHQ4E
FgQUKOA3mmsyFTbEqT0ZnFRDLUSX4cgwHwYDVR0jBBgwFoAUKOA3mmsyFTbEqT0Z
nFRDLUSX4cgwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAJDJs
B6fEb8beJsh6hlRCZ/9IWA6n5iKtl+9eKWcgFc7l4zd88D8VvjE0X505vpURiKtC
XlTFDACmKVysFoNfo/oFcEKNDynTSm9Er6v8Al6E2L3ZHzYALYyfDQtekecP05be
Ul/yEU9vrgPI7dhaLozc+VyPmBk5BT8jmi6R2XkiPu7QWcFlyy4omW6CLCR6iQwA
W46ABpYQVm0H8S+Jz1dBS7+cFCSOeEbzGWxH5Twtg4UbJoLTkGmE/a7mIXmKHRuu
J1QyDirBKCGdXmaJsZL9S4P22vPdZhjhEFVyRSRILiEHaa3bIHgXzmVSjvqHG0Ya
EvBUMYdyCvXRBwwPLg==
-----END CERTIFICATE-----`;

const TEST_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQCuTUTXh94+KAz3
nj+U5O5CmScsQoddRcqYTGrRvrP+KN6m3tV3GjoMYe5cezAiA1OThobh/bLSRlES
vuVz8Yy4+CcvVtDc9e94KzHBlvI+IDMLRC9Bh4ndvxn7eSkK0Cil0oZHbfHYnKDc
6zAJZ8S59newNYkc71bCDUY77jJkxyC4nJl9gmbydGyEq8b3QnDeUJJ0hTIrxWv+
jntAQ6VMzNvaGXSMaqJn/vDV6XAr4IB1NV0psrF0kTFtn/WQ6t1vGlgkj0ENGK4w
dCWAn7cHuFySkVL4HyLf1wUkQjXRCP2m3TwuHGGmxXslIpa8l7acg8YoNLa+uYZQ
/oTKR907AgMBAAECggEAOYU3WDc2wOVfriGzktPfyuuW0VTdLgs3mf3x7GjWJmRf
Ycs8v9LQYEC7NBrVHgxh+tfU0GR0LE9XNuv3dcU7btk5uTYZtCmXDt2WTHAfXiAr
KCcmvyXW+e40SVhJEo/yMhLhDFZ8jsLVlUIp9pifg80R330zU/Cp/Vz7FhD74WSH
5kqrYN/2ald13k3iang4Og+SzwwXic2j2VK9Vdvrd/v9ox5QcEqnrJI72J7nokog
FNKwLJj9mZRxcaSUiRRcGEmsDzJTvcOy5d3QLzyUzUgv+MPefC661tx/okbWSiIv
Ywt/BiwstTFw0vItzp+QpQVPfdYHqzRZXT0cb2KwSQKBgQDa1+e/yISTzBXzt6vI
id1qhZMe7MxHd0n1qShThYDtEpKKF3yEUnXcXwUnzY9k4kYI5GwEe4NGZ+iVsTlM
WdgyJaEL+eDpgVylXRC8Oy47v4Am16ccYgy06Kgn7LO2EE01IyirpqZKLuNrHyjs
fcC+jigG/0FigFPLfP83JjuCOQKBgQDL5VoASFTsHbAvQvroSE1uh9pRG3zry5Rj
gfOe4J4Xvtj77KtxlVpN0Wo60kK19bOCYQuq/XE+/37gowdRzHFIypkd2dfTIG3K
mtv5YiyGpCBbE2QL184VbmexTJ7bT4tq/UU9IxO9w8pjigIzx4VDLV2Ir3OcMl75
4bFWmGrLEwKBgQDP7JDQ47grIJ2+yMSbLXnEqpLEsCHKyOjpUkXxTQfYt2upbnUs
15gJv/ILBkB2jpISAs0qWRu5+iG+j/qrszU5OA1SbqCl2vXmW4z5+pSLyf/9Z6nr
yrDd9atG+5snoUdp9DTBGf4mv3PtpFZik3xc0H3xX/aEmv6CeQmXIWkq6QKBgQCn
SKebvbx28DChxflnZBKrUaiLjNrj9mXrci33tt/eKYWKw3UxvlCVse/PDL0Q3uIF
YSuagU9NWX+2O+uAcBStnRMcy6LoJB4P8RfzNlnDqZqmPnWBxe/d43QNoghfdJa1
E9CfxUyoD5/YJN2Dr/mk0O6BezmF+Em2CDZgDrLnowKBgQC4ry+qrLLMImT/qVVW
fyz4OJF4iMC5NGQhVsl3u9gs/18PySr+OmvJkHl9tmHZW9am2YVa6JT/+YD15PgX
KqlGKJ3b9H/YWaCJDn+AE9troMTE6H6LqAPCBPv+oNDyPAKFgy/OtAjDRlpa0Vj+
Vese9kSmRshW56wli5RnTcBT1w==
-----END PRIVATE KEY-----`;

interface CapturedRequest {
  headers: IncomingHttpHeaders;
  body: string;
}

async function createMockApnsServer() {
  const requests: CapturedRequest[] = [];
  const server = createSecureServer({ key: TEST_KEY, cert: TEST_CERT });

  server.on("stream", (stream, headers) => {
    let body = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => {
      body += chunk;
    });
    stream.on("end", () => {
      requests.push({ headers, body });

      const path = String(headers[constants.HTTP2_HEADER_PATH] ?? "");
      if (path.includes("stale-token")) {
        stream.respond({
          [constants.HTTP2_HEADER_STATUS]: 410,
          "apns-id": "mock-stale",
        });
        stream.end(JSON.stringify({ reason: "BadDeviceToken" }));
        return;
      }

      stream.respond({
        [constants.HTTP2_HEADER_STATUS]: 200,
        "apns-id": "mock-ok",
      });
      stream.end("");
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  const endpoint = `https://localhost:${address.port}`;

  const close = async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  };

  return { requests, endpoint, close };
}

function createConfig(endpoint: string): ApnsConfig {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return {
    keyId: "ABC123DEFG",
    teamId: "TEAM123ABC",
    bundleId: "lu.ryo.os",
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    useSandbox: false,
    endpointOverride: endpoint,
    caCert: TEST_CERT,
  };
}

async function testSuccessfulSend() {
  const { requests, endpoint, close } = await createMockApnsServer();
  try {
    const result = await sendApnsAlert(createConfig(endpoint), "valid-token-1234567890", {
      title: "Hello",
      body: "World",
      badge: 3,
      data: { feature: "push-test" },
    });

    assertEq(result.ok, true, "Expected successful APNs send");
    assertEq(result.status, 200, `Expected status 200, got ${result.status}`);
    assertEq(result.apnsId, "mock-ok", "Expected mock apns-id from server");
    assertEq(requests.length, 1, "Expected one request to mock APNs server");

    const request = requests[0];
    assertEq(request.headers["apns-topic"], "lu.ryo.os", "Missing APNs topic header");
    assertEq(request.headers["apns-push-type"], "alert", "Missing APNs push type header");

    const payload = JSON.parse(request.body);
    assertEq(payload.aps?.alert?.title, "Hello", "Missing alert title");
    assertEq(payload.aps?.alert?.body, "World", "Missing alert body");
    assertEq(payload.aps?.badge, 3, "Missing badge in payload");
    assertEq(payload.data?.feature, "push-test", "Missing custom data payload");
  } finally {
    await close();
  }
}

async function testStaleTokenReasonPropagation() {
  const { endpoint, close } = await createMockApnsServer();
  try {
    const result = await sendApnsAlert(createConfig(endpoint), "stale-token-1234567890", {
      title: "Hello",
      body: "World",
    });

    assertEq(result.ok, false, "Expected stale token send to fail");
    assertEq(result.status, 410, `Expected status 410, got ${result.status}`);
    assertEq(result.reason, "BadDeviceToken", "Expected APNs stale token reason");
    assertEq(result.apnsId, "mock-stale", "Expected APNs id on stale token error");
  } finally {
    await close();
  }
}

async function testMissingCaCertFailsTlsHandshake() {
  const { endpoint, close } = await createMockApnsServer();
  try {
    const config = createConfig(endpoint);
    delete config.caCert;

    const result = await sendApnsAlert(config, "valid-token-1234567890", {
      title: "Hello",
      body: "World",
    });

    assertEq(result.ok, false, "Expected TLS handshake failure without custom CA");
    assert(result.reason?.startsWith("SESSION_ERROR:"), "Expected SESSION_ERROR reason");
  } finally {
    await close();
  }
}

async function testInvalidPrivateKeyReturnsJwtError() {
  const result = await sendApnsAlert(
    {
      keyId: "ABC123DEFG",
      teamId: "TEAM123ABC",
      bundleId: "lu.ryo.os",
      privateKey: "not-a-valid-private-key",
      useSandbox: false,
      endpointOverride: "https://api.push.apple.com",
    },
    "valid-token-1234567890",
    {
      title: "Hello",
      body: "World",
    }
  );

  assertEq(result.ok, false, "Expected invalid private key to fail");
  assert(result.reason?.startsWith("JWT_ERROR:"), "Expected JWT_ERROR reason");
}

async function testInvalidEndpointOverrideReturnsConnectError() {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const result = await sendApnsAlert(
    {
      keyId: "ABC123DEFG",
      teamId: "TEAM123ABC",
      bundleId: "lu.ryo.os",
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      useSandbox: false,
      endpointOverride: "https://",
    },
    "valid-token-1234567890",
    {
      title: "Hello",
      body: "World",
    }
  );

  assertEq(result.ok, false, "Expected invalid endpoint override to fail");
  assert(result.reason?.startsWith("CONNECT_ERROR:"), "Expected CONNECT_ERROR reason");
}

function withEnv<T>(envPatch: Record<string, string | undefined>, run: () => T): T {
  const originalValues = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(envPatch)) {
    originalValues.set(key, process.env[key]);
    if (typeof value === "undefined") {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return run();
  } finally {
    for (const [key, value] of originalValues.entries()) {
      if (typeof value === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function testApnsEnvValidationHelpers() {
  withEnv(
    {
      APNS_KEY_ID: undefined,
      APNS_TEAM_ID: undefined,
      APNS_BUNDLE_ID: undefined,
      APNS_PRIVATE_KEY: undefined,
    },
    () => {
      const missing = getMissingApnsEnvVars();
      assertEq(missing.includes("APNS_KEY_ID"), true);
      assertEq(missing.includes("APNS_TEAM_ID"), true);
      assertEq(missing.includes("APNS_BUNDLE_ID"), true);
      assertEq(missing.includes("APNS_PRIVATE_KEY"), true);
      assertEq(getApnsConfigFromEnv(), null);
    }
  );

  withEnv(
    {
      APNS_KEY_ID: "ABC123DEFG",
      APNS_TEAM_ID: "TEAM123ABC",
      APNS_BUNDLE_ID: "lu.ryo.os",
      APNS_PRIVATE_KEY:
        "-----BEGIN PRIVATE KEY-----\\nline-1\\nline-2\\n-----END PRIVATE KEY-----",
      APNS_ENDPOINT_OVERRIDE: "https://example.test/custom/path?x=1",
      APNS_CA_CERT:
        "-----BEGIN CERTIFICATE-----\\nline-a\\nline-b\\n-----END CERTIFICATE-----",
      APNS_USE_SANDBOX: "TRUE",
    },
    () => {
      const missing = getMissingApnsEnvVars();
      assertEq(missing.length, 0, "Expected all required APNs env vars to be present");

      const config = getApnsConfigFromEnv();
      assert(config !== null, "Expected APNs config when required env vars are present");
      if (!config) return;

      assertEq(config.endpointOverride, "https://example.test");
      assertEq(config.useSandbox, true);
      assert(config.privateKey.includes("\nline-1\n"), "Expected private key newline normalization");
      assert(config.caCert?.includes("\nline-a\n"), "Expected CA cert newline normalization");
    }
  );

  withEnv(
    {
      APNS_KEY_ID: "ABC123DEFG",
      APNS_TEAM_ID: "TEAM123ABC",
      APNS_BUNDLE_ID: "lu.ryo.os",
      APNS_PRIVATE_KEY:
        "-----BEGIN PRIVATE KEY-----\\nline-1\\nline-2\\n-----END PRIVATE KEY-----",
      APNS_ENDPOINT_OVERRIDE: "http://insecure.example.test",
    },
    () => {
      const config = getApnsConfigFromEnv();
      assert(config !== null, "Expected APNs config with required vars present");
      if (!config) return;
      assertEq(config.endpointOverride, undefined);
    }
  );
}

export async function runPushApnsTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("push-apns"));
  clearResults();

  await runTest("APNs helper sends valid HTTP/2 request", testSuccessfulSend);
  await runTest("APNs helper preserves stale-token reason", testStaleTokenReasonPropagation);
  await runTest(
    "APNs helper fails TLS handshake without custom CA",
    testMissingCaCertFailsTlsHandshake
  );
  await runTest("APNs helper returns JWT error on invalid key", testInvalidPrivateKeyReturnsJwtError);
  await runTest(
    "APNs helper returns connect error on invalid endpoint",
    testInvalidEndpointOverrideReturnsConnectError
  );
  await runTest("APNs env helper reports missing/normalized vars", testApnsEnvValidationHelpers);

  return printSummary();
}

if (import.meta.main) {
  runPushApnsTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
