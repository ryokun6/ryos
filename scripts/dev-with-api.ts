#!/usr/bin/env bun

/**
 * Starts both the standalone API server and the Vite dev server with API proxy.
 * Use: bun run dev (or bun run scripts/dev-with-api.ts)
 *
 * Exits both processes on Ctrl+C.
 */

const API_PORT = process.env.API_PORT ?? "3000";
const PORT = process.env.PORT ?? "5173";

const api = Bun.spawn(
  ["bun", "run", "dev:api"],
  {
    cwd: import.meta.dirname + "/..",
    env: { ...process.env, API_PORT },
    stdout: "pipe",
    stderr: "pipe",
  }
);

const vite = Bun.spawn(
  ["bun", "run", "dev:vite"],
  {
    cwd: import.meta.dirname + "/..",
    env: {
      ...process.env,
      STANDALONE_API_PROXY_TARGET: `http://localhost:${API_PORT}`,
      API_PORT,
      PORT,
    },
    stdout: "pipe",
    stderr: "pipe",
  }
);

function prefix(stream: ReadableStream<Uint8Array>, name: string) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const line = decoder.decode(value, { stream: true });
        for (const part of line.split("\n").filter(Boolean)) {
          console.log(`[${name}] ${part}`);
        }
      }
    } catch {
      // stream closed
    }
  })();
}

prefix(api.stdout!, "api");
prefix(api.stderr!, "api");
prefix(vite.stdout!, "vite");
prefix(vite.stderr!, "vite");

function kill() {
  api.kill();
  vite.kill();
  process.exit(0);
}

process.on("SIGINT", kill);
process.on("SIGTERM", kill);

api.exited.then((code) => {
  if (code !== 0 && code !== null) {
    vite.kill();
    process.exit(code);
  }
});
vite.exited.then((code) => {
  if (code !== 0 && code !== null) {
    api.kill();
    process.exit(code);
  }
});
