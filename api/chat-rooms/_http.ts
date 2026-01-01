import { getEffectiveOrigin, preflightIfNeeded } from "../_utils/cors.js";
import { logRequest, logInfo, logError, generateRequestId } from "../_utils/logging.js";
import { addCorsHeaders, createErrorResponse } from "./_helpers.js";

type HandlerContext = {
  request: Request;
  requestId: string;
  origin: string | null;
  url: URL;
};

/**
 * Shared request wrapper for chat-rooms sub-routes.
 * - Handles CORS (including OPTIONS preflight)
 * - Adds request logging and duration logging
 * - Wraps errors with a 500 response
 */
export async function handleRequest(
  request: Request,
  options: {
    allowedMethods: string[];
    action?: string | null;
    handler: (ctx: HandlerContext) => Promise<Response>;
  }
): Promise<Response> {
  const origin = getEffectiveOrigin(request);
  const preflightResp = preflightIfNeeded(
    request,
    options.allowedMethods,
    origin
  );
  if (preflightResp) return preflightResp;

  const requestId = generateRequestId();
  const startTime = performance.now();
  const url = new URL(request.url);

  logRequest(request.method, request.url, options.action ?? null, requestId);

  try {
    const response = await options.handler({ request, requestId, origin, url });
    return addCorsHeaders(response, origin);
  } catch (error) {
    logError(requestId, "Error handling request:", error);
    const response = createErrorResponse("Internal server error", 500);
    return addCorsHeaders(response, origin);
  } finally {
    const duration = performance.now() - startTime;
    logInfo(requestId, `Request completed in ${duration.toFixed(2)}ms`);
  }
}
