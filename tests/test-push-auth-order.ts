#!/usr/bin/env bun
/**
 * Tests auth-first behavior for push API handlers.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import pushRegisterHandler from "../_api/push/register";
import pushUnregisterHandler from "../_api/push/unregister";
import pushTestHandler from "../_api/push/test";
import {
  assertEq,
  clearResults,
  printSummary,
  runTest,
  section,
  withPatchedEnv,
} from "./test-utils";

type PushHandler = (req: VercelRequest, res: VercelResponse) => Promise<unknown>;

interface MockResponse {
  res: VercelResponse;
  getStatusCode: () => number;
  getJsonPayload: () => unknown;
}

function createMockResponse(): MockResponse {
  let statusCode = 0;
  let jsonPayload: unknown = null;

  const response = {
    setHeader: () => undefined,
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      jsonPayload = payload;
      return payload;
    },
    end: () => undefined,
  };

  return {
    res: response as unknown as VercelResponse,
    getStatusCode: () => statusCode,
    getJsonPayload: () => jsonPayload,
  };
}

function createPostRequest(url: string): VercelRequest {
  return {
    method: "POST",
    url,
    headers: {
      origin: "http://localhost:3000",
    },
    body: {},
  } as unknown as VercelRequest;
}

async function expectMissingCredentialsResponse(
  handler: PushHandler,
  endpointPath: string
) {
  const req = createPostRequest(endpointPath);
  const mockRes = createMockResponse();

  await handler(req, mockRes.res);

  assertEq(mockRes.getStatusCode(), 401);
  assertEq(
    JSON.stringify(mockRes.getJsonPayload()),
    JSON.stringify({ error: "Unauthorized - missing credentials" })
  );
}

async function testRegisterMissingCredentialsTakesPrecedence() {
  await Promise.resolve(
    withPatchedEnv(
      {
        VERCEL_ENV: "development",
        REDIS_KV_REST_API_URL: undefined,
        REDIS_KV_REST_API_TOKEN: undefined,
      },
      async () => {
        await expectMissingCredentialsResponse(pushRegisterHandler, "/api/push/register");
      }
    )
  );
}

async function testUnregisterMissingCredentialsTakesPrecedence() {
  await Promise.resolve(
    withPatchedEnv(
      {
        VERCEL_ENV: "development",
        REDIS_KV_REST_API_URL: undefined,
        REDIS_KV_REST_API_TOKEN: undefined,
      },
      async () => {
        await expectMissingCredentialsResponse(
          pushUnregisterHandler,
          "/api/push/unregister"
        );
      }
    )
  );
}

async function testPushTestMissingCredentialsTakesPrecedence() {
  await Promise.resolve(
    withPatchedEnv(
      {
        VERCEL_ENV: "development",
        REDIS_KV_REST_API_URL: undefined,
        REDIS_KV_REST_API_TOKEN: undefined,
        APNS_KEY_ID: undefined,
        APNS_TEAM_ID: undefined,
        APNS_BUNDLE_ID: undefined,
        APNS_PRIVATE_KEY: undefined,
      },
      async () => {
        await expectMissingCredentialsResponse(pushTestHandler, "/api/push/test");
      }
    )
  );
}

export async function runPushAuthOrderTests(): Promise<{ passed: number; failed: number }> {
  console.log(section("push-auth-order"));
  clearResults();

  await runTest(
    "Push register returns 401 before Redis config checks",
    testRegisterMissingCredentialsTakesPrecedence
  );
  await runTest(
    "Push unregister returns 401 before Redis config checks",
    testUnregisterMissingCredentialsTakesPrecedence
  );
  await runTest(
    "Push test returns 401 before Redis/APNs config checks",
    testPushTestMissingCredentialsTakesPrecedence
  );

  return printSummary();
}

if (import.meta.main) {
  runPushAuthOrderTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error("Test runner error:", error);
      process.exit(1);
    });
}
