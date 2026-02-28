import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "./_utils/_cors.js";
import { initLogger } from "./_utils/_logging.js";
import { getClientIp } from "./_utils/_rate-limit.js";
import { executeAppletAiCore } from "./cores/applet-ai-core.js";

export const runtime = "nodejs";
export const maxDuration = 60;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { logger } = initLogger();
  const startTime = Date.now();

  const effectiveOrigin = getEffectiveOrigin(req);
  setCorsHeaders(res, effectiveOrigin, { methods: ["POST", "OPTIONS"] });

  logger.request(req.method || "POST", req.url || "/api/applet-ai");

  if (req.method === "OPTIONS") {
    logger.response(204, Date.now() - startTime);
    return res.status(204).end();
  }

  const result = await executeAppletAiCore({
    originAllowed: isAllowedOrigin(effectiveOrigin),
    host: (req.headers.host as string | undefined) || null,
    method: req.method,
    body: req.body,
    authHeader: req.headers.authorization as string | undefined,
    usernameHeaderRaw: req.headers["x-username"] as string | undefined,
    clientIp: getClientIp(req),
  });

  if (result.headers) {
    Object.entries(result.headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
  }

  if (result.status === 403) {
    const error = (result.body as { error?: string })?.error;
    if (error === "Unauthorized host") {
      logger.warn("Unauthorized host", { host: req.headers.host });
    } else {
      logger.warn("Unauthorized origin", { effectiveOrigin });
    }
  } else if (result.status === 405) {
    logger.warn("Method not allowed", { method: req.method });
  } else if (result.status === 401) {
    logger.error("Authentication failed – invalid or missing token", {
      username: req.headers["x-username"] || "anonymous",
    });
  } else if (result.status === 400) {
    logger.error("Invalid applet-ai request body");
  } else if (result.status === 429) {
    logger.info("applet-ai rate limited");
  } else if (result.status >= 500) {
    logger.error("applet-ai processing failed");
  }

  logger.response(result.status, Date.now() - startTime);

  if (
    result.status === 200 &&
    result.headers?.["Content-Type"]?.startsWith("image/") &&
    result.body instanceof Uint8Array
  ) {
    return res.status(200).send(Buffer.from(result.body));
  }

  return res.status(result.status).json(result.body);
}
