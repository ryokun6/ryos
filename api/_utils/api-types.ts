/**
 * Node-style request/response types for API route handlers.
 *
 * Routes are plain Node handlers served by the standalone Bun server
 * (`scripts/api-standalone-server.ts`), which provides request/response
 * shims implementing exactly this contract.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

export type ApiRequestQuery = { [key: string]: string | string[] };
export type ApiRequestCookies = { [key: string]: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiRequestBody = any;

export type ApiRequest = IncomingMessage & {
  query: ApiRequestQuery;
  cookies: ApiRequestCookies;
  body: ApiRequestBody;
};

export type ApiResponse = ServerResponse & {
  send: (body: unknown) => ApiResponse;
  json: (jsonBody: unknown) => ApiResponse;
  status: (statusCode: number) => ApiResponse;
  redirect: (statusOrUrl: string | number, url?: string) => ApiResponse;
};
