import { createServer } from "node:http";
import { normalizePathname, matchRoute } from "../_api/_runtime/http-helpers.js";
import { API_ROUTES } from "../_api/_runtime/routes.js";
import {
  enhanceNodeRequest,
  enhanceNodeResponse,
  parseNodeBody,
} from "../_api/_runtime/adapters/node-vercel-compat.js";

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || process.env.API_PORT || 3001);

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = normalizePathname(url.pathname);

  if (pathname === "/api/health") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        ok: true,
        service: "ryos-api-vps",
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  const matched = matchRoute(pathname, API_ROUTES);
  if (!matched) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  const vRes = enhanceNodeResponse(res);

  try {
    const body =
      matched.route.parseBody === false ? undefined : await parseNodeBody(req);
    const vReq = enhanceNodeRequest(req, url, matched.params, body);
    const handler = await matched.route.loadHandler();

    await Promise.resolve(handler(vReq, vRes));

    if (!res.writableEnded) {
      res.end();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unhandled API error";
    console.error(`[vps-api] ${req.method || "GET"} ${pathname} failed:`, error);

    if (res.headersSent || res.writableEnded) {
      return;
    }

    res.statusCode = message.includes("Body exceeds limit") ? 413 : 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: message }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[vps-api] Listening on http://${HOST}:${PORT}`);
  console.log(`[vps-api] Health check: http://${HOST}:${PORT}/api/health`);
});
