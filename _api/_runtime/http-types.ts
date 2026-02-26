import type { IncomingMessage, ServerResponse } from "node:http";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export type QueryValue = string | string[];
export type Query = Record<string, QueryValue>;

export type VercelLikeHandler = (
  req: VercelRequest,
  res: VercelResponse
) => Promise<unknown> | unknown;

export interface RouteDefinition {
  pattern: string;
  /**
   * Whether the body should be parsed before calling the handler.
   * Set to false for streaming/multipart handlers that read from req directly.
   */
  parseBody?: boolean;
  loadHandler: () => Promise<VercelLikeHandler>;
}

export interface NodeRequestContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  pathname: string;
}
