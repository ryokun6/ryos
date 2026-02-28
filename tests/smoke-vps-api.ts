/**
 * Lightweight runtime smoke tests for the VPS API adapter.
 * Designed to validate endpoint wiring and CORS behavior.
 */

const baseUrl = process.env.API_BASE_URL || "http://127.0.0.1:3100";
const mode = process.env.SMOKE_MODE || "development";
const localhostOrigin = "http://localhost:5173";
const productionAllowedOrigin = "http://example.com";
const requestOrigin = mode === "production" ? productionAllowedOrigin : localhostOrigin;

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchText(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, init);
}

async function testHealth(): Promise<void> {
  const res = await fetchText(`${baseUrl}/api/health`);
  assert(res.status === 200, `health expected 200, got ${res.status}`);
  const json = (await res.json()) as { ok?: boolean };
  assert(json.ok === true, "health response missing ok=true");
}

async function testParseTitle(): Promise<void> {
  const res = await fetchText(`${baseUrl}/api/parse-title`, {
    method: "POST",
    headers: {
      Origin: requestOrigin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: "Artist - Song" }),
  });
  assert(res.status === 200, `parse-title expected 200, got ${res.status}`);
  const json = (await res.json()) as { title?: string; artist?: string };
  assert(json.title === "Song", `parse-title title mismatch: ${json.title ?? "undefined"}`);
  assert(json.artist === "Artist", `parse-title artist mismatch: ${json.artist ?? "undefined"}`);
}

async function testDynamicSongsRoute(): Promise<void> {
  const res = await fetchText(`${baseUrl}/api/songs/nonexistent123?include=metadata`, {
    headers: { Origin: requestOrigin },
  });
  assert(res.status === 404, `songs dynamic route expected 404, got ${res.status}`);
}

async function testCorsByMode(): Promise<void> {
  const localhostRes = await fetchText(
    `${baseUrl}/api/iframe-check?url=${encodeURIComponent("https://example.com")}`,
    { headers: { Origin: localhostOrigin } }
  );

  if (mode === "production") {
    assert(
      localhostRes.status === 403,
      `production localhost origin expected 403, got ${localhostRes.status}`
    );

    const prodAllowedRes = await fetchText(
      `${baseUrl}/api/iframe-check?url=${encodeURIComponent("https://example.com")}`,
      { headers: { Origin: productionAllowedOrigin } }
    );
    assert(
      prodAllowedRes.status === 200,
      `production allowed origin expected 200, got ${prodAllowedRes.status}`
    );
  } else {
    assert(
      localhostRes.status === 200,
      `development localhost origin expected 200, got ${localhostRes.status}`
    );
  }
}

async function main(): Promise<void> {
  await testHealth();
  await testParseTitle();
  await testDynamicSongsRoute();
  await testCorsByMode();
  console.log(`[smoke-vps-api] ${mode} checks passed at ${baseUrl}`);
}

main().catch((error) => {
  console.error("[smoke-vps-api] failed:", error);
  process.exit(1);
});
