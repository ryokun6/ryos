#!/usr/bin/env bun

/**
 * Starts both the standalone API server and the Vite dev server with API proxy.
 * Use: bun run dev (or bun run scripts/dev-with-api.ts)
 *
 * Exits both processes on Ctrl+C.
 */

const API_PORT = process.env.API_PORT ?? "3000";
// Bun auto-loads .env.local which may set PORT=3000 (used by the API).
// The Vite dev server needs a separate port to avoid conflicts.
const VITE_PORT = process.env.VITE_PORT ?? "5173";
const PORT = VITE_PORT === API_PORT ? "5173" : VITE_PORT;

/** S3 presigned PUT from localhost needs bucket CORS; proxy via the API in dev. */
function devStorageUploadEnv(): Record<string, string> {
  if (process.env.STORAGE_CLIENT_UPLOAD?.trim()) {
    return {};
  }

  const provider = process.env.STORAGE_PROVIDER?.trim().toLowerCase();
  const usesS3 =
    provider === "s3" ||
    provider === "s3-compatible" ||
    provider === "minio" ||
    provider === "r2" ||
    Boolean(process.env.S3_BUCKET?.trim() && process.env.S3_ENDPOINT?.trim());

  if (!usesS3) {
    return {};
  }

  return { STORAGE_CLIENT_UPLOAD: "proxy" };
}

const sharedDevEnv = {
  ...process.env,
  ...devStorageUploadEnv(),
};

const api = Bun.spawn(
  ["bun", "run", "dev:api"],
  {
    cwd: import.meta.dirname + "/..",
    env: { ...sharedDevEnv, API_PORT },
    stdout: "pipe",
    stderr: "pipe",
  }
);

const vite = Bun.spawn(
  ["bun", "run", "dev:vite"],
  {
    cwd: import.meta.dirname + "/..",
    env: {
      ...sharedDevEnv,
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
