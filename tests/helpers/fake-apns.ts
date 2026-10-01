/**
 * Cleartext HTTP/2 stand-in for api.push.apple.com used by push-relay tests.
 * Each instance plays one APNs environment; `respond` decides the reply.
 */

import http2 from "node:http2";

export interface FakeApnsRequest {
  path: string;
  deviceToken: string;
  headers: http2.IncomingHttpHeaders;
  body: unknown;
}

export interface FakeApnsReply {
  status: number;
  reason?: string;
}

export interface FakeApnsServer {
  url: string;
  requests: FakeApnsRequest[];
  respond: (request: FakeApnsRequest) => FakeApnsReply;
  close: () => Promise<void>;
}

export async function startFakeApns(
  respond: (request: FakeApnsRequest) => FakeApnsReply = () => ({ status: 200 })
): Promise<FakeApnsServer> {
  const server = http2.createServer();
  const fake: FakeApnsServer = {
    url: "",
    requests: [],
    respond,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };

  server.on("stream", (stream, headers) => {
    let raw = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => {
      raw += chunk;
    });
    stream.on("end", () => {
      const path = String(headers[":path"] ?? "");
      let body: unknown = raw;
      try {
        body = JSON.parse(raw);
      } catch {
        // keep raw text
      }
      const request: FakeApnsRequest = {
        path,
        deviceToken: path.replace(/^\/3\/device\//, ""),
        headers,
        body,
      };
      fake.requests.push(request);
      const reply = fake.respond(request);
      stream.respond({
        ":status": reply.status,
        "apns-id": `fake-${fake.requests.length}`,
        ...(reply.reason ? { "content-type": "application/json" } : {}),
      });
      stream.end(reply.reason ? JSON.stringify({ reason: reply.reason }) : undefined);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  fake.url = `http://127.0.0.1:${port}`;
  return fake;
}
