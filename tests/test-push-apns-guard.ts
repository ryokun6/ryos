#!/usr/bin/env bun
/**
 * Tests for shared push APNs guard helper.
 */

import { getApnsConfigOrRespond } from "../_api/push/_apns-guard";
import {
  assertEq,
  clearResults,
  createMockPushLoggerHarness,
  createMockVercelResponseHarness,
  printSummary,
  runTest,
  section,
  withPatchedEnv,
} from "./test-utils";

async function testApnsGuardRespondsWhenEnvMissing() {
  await Promise.resolve(
    withPatchedEnv(
      {
        APNS_KEY_ID: undefined,
        APNS_TEAM_ID: undefined,
        APNS_BUNDLE_ID: undefined,
        APNS_PRIVATE_KEY: undefined,
      },
      async () => {
        const mockRes = createMockVercelResponseHarness();
        const mockLogger = createMockPushLoggerHarness();

        const config = getApnsConfigOrRespond(mockRes.res, mockLogger.logger, Date.now());

        assertEq(config, null);
        assertEq(mockRes.getStatusCode(), 500);
        assertEq(
          JSON.stringify(mockRes.getJsonPayload()),
          JSON.stringify({
            error: "APNs is not configured.",
            missingEnvVars: [
              "APNS_KEY_ID",
              "APNS_TEAM_ID",
              "APNS_BUNDLE_ID",
              "APNS_PRIVATE_KEY",
            ],
          })
        );
        assertEq(mockLogger.warnCalls.length, 1);
        assertEq(mockLogger.warnCalls[0].message, "APNs is not configured");
        assertEq(mockLogger.responseCalls.length, 1);
        assertEq(mockLogger.responseCalls[0].statusCode, 500);
        assertEq(mockLogger.errorCalls.length, 0);
      }
    )
  );
}

async function testApnsGuardTreatsWhitespaceEnvAsMissing() {
  await Promise.resolve(
    withPatchedEnv(
      {
        APNS_KEY_ID: "key-id",
        APNS_TEAM_ID: "team-id",
        APNS_BUNDLE_ID: "bundle-id",
        APNS_PRIVATE_KEY: "   ",
      },
      async () => {
        const mockRes = createMockVercelResponseHarness();
        const mockLogger = createMockPushLoggerHarness();

        const config = getApnsConfigOrRespond(mockRes.res, mockLogger.logger, Date.now());

        assertEq(config, null);
        assertEq(mockRes.getStatusCode(), 500);
        assertEq(
          JSON.stringify(mockRes.getJsonPayload()),
          JSON.stringify({
            error: "APNs is not configured.",
            missingEnvVars: ["APNS_PRIVATE_KEY"],
          })
        );
        assertEq(mockLogger.warnCalls.length, 1);
        assertEq(mockLogger.responseCalls.length, 1);
        assertEq(mockLogger.responseCalls[0].statusCode, 500);
      }
    )
  );
}

async function testApnsGuardReturnsNormalizedConfigWhenEnvValid() {
  await Promise.resolve(
    withPatchedEnv(
      {
        APNS_KEY_ID: "key-id",
        APNS_TEAM_ID: "team-id",
        APNS_BUNDLE_ID: "bundle-id",
        APNS_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
        APNS_USE_SANDBOX: "TRUE",
        APNS_ENDPOINT_OVERRIDE: "https://example.test/path?foo=bar",
        APNS_CA_CERT: "-----BEGIN CERTIFICATE-----\\nca\\n-----END CERTIFICATE-----",
      },
      async () => {
        const mockRes = createMockVercelResponseHarness();
        const mockLogger = createMockPushLoggerHarness();

        const config = getApnsConfigOrRespond(mockRes.res, mockLogger.logger, Date.now());

        assertEq(config?.keyId, "key-id");
        assertEq(config?.teamId, "team-id");
        assertEq(config?.bundleId, "bundle-id");
        assertEq(config?.useSandbox, true);
        assertEq(config?.endpointOverride, "https://example.test");
        assertEq(
          config?.privateKey,
          "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----"
        );
        assertEq(
          config?.caCert,
          "-----BEGIN CERTIFICATE-----\nca\n-----END CERTIFICATE-----"
        );
        assertEq(mockRes.getStatusCode(), 0);
        assertEq(mockLogger.warnCalls.length, 0);
        assertEq(mockLogger.responseCalls.length, 0);
        assertEq(mockLogger.errorCalls.length, 0);
      }
    )
  );
}

async function testApnsGuardWorksWithoutWarnLogger() {
  await Promise.resolve(
    withPatchedEnv(
      {
        APNS_KEY_ID: undefined,
        APNS_TEAM_ID: undefined,
        APNS_BUNDLE_ID: undefined,
        APNS_PRIVATE_KEY: undefined,
      },
      async () => {
        const mockRes = createMockVercelResponseHarness();
        const mockLogger = createMockPushLoggerHarness({ includeWarn: false });

        const config = getApnsConfigOrRespond(
          mockRes.res,
          mockLogger.logger,
          Date.now()
        );

        assertEq(config, null);
        assertEq(typeof mockLogger.logger.warn, "undefined");
        assertEq(mockLogger.responseCalls.length, 1);
        assertEq(mockLogger.responseCalls[0].statusCode, 500);
        assertEq(mockLogger.errorCalls.length, 0);
        assertEq(mockLogger.warnCalls.length, 0);
        assertEq(mockRes.getStatusCode(), 500);
        assertEq(
          JSON.stringify(mockRes.getJsonPayload()),
          JSON.stringify({
            error: "APNs is not configured.",
            missingEnvVars: [
              "APNS_KEY_ID",
              "APNS_TEAM_ID",
              "APNS_BUNDLE_ID",
              "APNS_PRIVATE_KEY",
            ],
          })
        );
      }
    )
  );
}

export async function runPushApnsGuardTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("push-apns-guard"));
  clearResults();

  await runTest(
    "Push APNs guard responds with 500 when env vars missing",
    testApnsGuardRespondsWhenEnvMissing
  );
  await runTest(
    "Push APNs guard treats whitespace env vars as missing",
    testApnsGuardTreatsWhitespaceEnvAsMissing
  );
  await runTest(
    "Push APNs guard returns normalized config when env valid",
    testApnsGuardReturnsNormalizedConfigWhenEnvValid
  );
  await runTest(
    "Push APNs guard works when logger.warn is absent",
    testApnsGuardWorksWithoutWarnLogger
  );

  return printSummary();
}

if (import.meta.main) {
  runPushApnsGuardTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
