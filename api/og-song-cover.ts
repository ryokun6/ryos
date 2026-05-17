import { apiHandler } from "./_utils/api-handler.js";
import { createOgSongCoverResponse } from "./_utils/og-share.js";

export const runtime = "nodejs";
export const maxDuration = 15;

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function requestOrigin(req: { headers: Record<string, string | string[] | undefined> }): string {
  const proto = headerValue(req.headers["x-forwarded-proto"]) || "https";
  const host =
    headerValue(req.headers["x-forwarded-host"]) ||
    headerValue(req.headers.host) ||
    "localhost";
  return `${proto}://${host}`;
}

export default apiHandler(
  { methods: ["GET", "HEAD"], contentType: null, analytics: false },
  async ({ req, res }) => {
    const requestUrl = new URL(req.url || "/api/og-song-cover", requestOrigin(req));
    const response = await createOgSongCoverResponse(
      new Request(requestUrl, { method: req.method || "GET" })
    );

    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    res.status(response.status);

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    const body = await response.arrayBuffer();
    res.send(Buffer.from(body));
  }
);
