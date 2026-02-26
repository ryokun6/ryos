/**
 * Runtime parity checks between:
 * - Vercel dev server APIs
 * - VPS adapter APIs
 *
 * This is intentionally lightweight and focuses on status/shape parity
 * for representative endpoints.
 */

const vercelBaseUrl = process.env.VERCEL_API_BASE_URL || "http://127.0.0.1:3000";
const vpsBaseUrl = process.env.VPS_API_BASE_URL || "http://127.0.0.1:3100";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchJson(
  baseUrl: string,
  path: string,
  init?: RequestInit
): Promise<{ status: number; headers: Headers; data: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, init);
  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // keep text
  }
  return { status: res.status, headers: res.headers, data };
}

async function testParseTitleParity(): Promise<void> {
  const init: RequestInit = {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: "Artist - Song" }),
  };

  const vercel = await fetchJson(vercelBaseUrl, "/api/parse-title", init);
  const vps = await fetchJson(vpsBaseUrl, "/api/parse-title", init);

  assert(vercel.status === 200, `vercel parse-title expected 200, got ${vercel.status}`);
  assert(vps.status === 200, `vps parse-title expected 200, got ${vps.status}`);

  const vercelData = vercel.data as { title?: string; artist?: string };
  const vpsData = vps.data as { title?: string; artist?: string };
  assert(
    vercelData.title === vpsData.title,
    `parse-title mismatch title: vercel=${vercelData.title} vps=${vpsData.title}`
  );
  assert(
    vercelData.artist === vpsData.artist,
    `parse-title mismatch artist: vercel=${vercelData.artist} vps=${vpsData.artist}`
  );
}

async function testSongsNotFoundParity(): Promise<void> {
  const init: RequestInit = {
    headers: { Origin: "http://localhost:5173" },
  };
  const path = "/api/songs/nonexistent123?include=metadata";
  const vercel = await fetchJson(vercelBaseUrl, path, init);
  const vps = await fetchJson(vpsBaseUrl, path, init);

  assert(vercel.status === 404, `vercel songs expected 404, got ${vercel.status}`);
  assert(vps.status === 404, `vps songs expected 404, got ${vps.status}`);

  const vercelError = (vercel.data as { error?: string })?.error;
  const vpsError = (vps.data as { error?: string })?.error;
  assert(
    vercelError === vpsError,
    `songs not-found error mismatch: vercel=${vercelError} vps=${vpsError}`
  );
}

async function testIframeCheckParity(): Promise<void> {
  const path = `/api/iframe-check?url=${encodeURIComponent("https://example.com")}`;
  const init: RequestInit = {
    headers: { Origin: "http://localhost:5173" },
  };

  const vercelRes = await fetch(`${vercelBaseUrl}${path}`, init);
  const vpsRes = await fetch(`${vpsBaseUrl}${path}`, init);

  assert(vercelRes.status === 200, `vercel iframe-check expected 200, got ${vercelRes.status}`);
  assert(vpsRes.status === 200, `vps iframe-check expected 200, got ${vpsRes.status}`);

  const vercelCsp = vercelRes.headers.get("content-security-policy");
  const vpsCsp = vpsRes.headers.get("content-security-policy");
  assert(!!vercelCsp, "vercel iframe-check missing content-security-policy");
  assert(!!vpsCsp, "vps iframe-check missing content-security-policy");
}

async function main(): Promise<void> {
  await testParseTitleParity();
  await testSongsNotFoundParity();
  await testIframeCheckParity();
  console.log(`[runtime-parity] parity checks passed (${vercelBaseUrl} vs ${vpsBaseUrl})`);
}

main().catch((error) => {
  console.error("[runtime-parity] failed:", error);
  process.exit(1);
});
