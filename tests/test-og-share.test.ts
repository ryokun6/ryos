import { afterEach, describe, expect, test } from "bun:test";
import { createOgShareResponse } from "../api/_utils/og-share";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
});

describe("og share response", () => {
  test("uses configured public origin for Coolify/self-host share pages", async () => {
    process.env.APP_PUBLIC_ORIGIN = "https://coolify.example.com";

    const response = await createOgShareResponse(
      new Request("http://127.0.0.1:4010/finder")
    );

    expect(response).not.toBeNull();
    expect(response?.headers.get("content-type")).toContain("text/html");

    const body = await response!.text();
    expect(body).toContain(
      '<meta property="og:url" content="https://coolify.example.com/finder">'
    );
    expect(body).toContain(
      '<meta property="og:image" content="https://coolify.example.com/icons/macosx/mac.png">'
    );
    expect(body).toContain(
      'location.replace("https://coolify.example.com/finder?_ryo=1")'
    );
  });

  test("skips requests that already include the bypass query", async () => {
    const response = await createOgShareResponse(
      new Request("https://coolify.example.com/finder?_ryo=1")
    );

    expect(response).toBeNull();
  });

  test("skips unrelated routes", async () => {
    const response = await createOgShareResponse(
      new Request("https://coolify.example.com/api/health")
    );

    expect(response).toBeNull();
  });

  test("emits image dimension and type hints for app share pages", async () => {
    process.env.APP_PUBLIC_ORIGIN = "https://coolify.example.com";

    const response = await createOgShareResponse(
      new Request("http://127.0.0.1:4010/finder")
    );

    const body = await response!.text();
    // Card type stays small for app icons
    expect(body).toContain('<meta name="twitter:card" content="summary">');
    // Asset metadata so social platforms render previews without a HEAD probe
    expect(body).toContain(
      '<meta property="og:image:type" content="image/png">'
    );
    expect(body).toContain('<meta property="og:image:width" content="256">');
    expect(body).toContain('<meta property="og:image:height" content="256">');
    expect(body).toContain(
      '<meta property="og:image:alt" content="Finder icon on ryOS">'
    );
    expect(body).toContain(
      '<meta name="twitter:image:alt" content="Finder icon on ryOS">'
    );
    // Both og:image AND og:image:url should be present (some scrapers want the latter)
    expect(body).toContain(
      '<meta property="og:image:url" content="https://coolify.example.com/icons/macosx/mac.png">'
    );
    // og:image:secure_url is only emitted for https URLs
    expect(body).toContain(
      '<meta property="og:image:secure_url" content="https://coolify.example.com/icons/macosx/mac.png">'
    );
  });

  test("renders the Applet Store icon for /applet-viewer", async () => {
    process.env.APP_PUBLIC_ORIGIN = "https://coolify.example.com";

    const response = await createOgShareResponse(
      new Request("http://127.0.0.1:4010/applet-viewer")
    );

    const body = await response!.text();
    // Was previously the generic "app.png" - now matches the Applet Store icon
    // used in the app itself + by the shared-applet route.
    expect(body).toContain(
      '<meta property="og:image" content="https://coolify.example.com/icons/macosx/applet.png">'
    );
    expect(body).toContain(
      '<meta property="og:title" content="Applet Store on ryOS">'
    );
  });

  test("renders /tv share metadata", async () => {
    process.env.APP_PUBLIC_ORIGIN = "https://coolify.example.com";

    const response = await createOgShareResponse(
      new Request("http://127.0.0.1:4010/tv")
    );

    expect(response).not.toBeNull();
    const body = await response!.text();
    expect(body).toContain(
      '<meta property="og:image" content="https://coolify.example.com/icons/macosx/tv.png">'
    );
    expect(body).toContain('<meta property="og:title" content="TV on ryOS">');
  });

  test("legacy /infinite-pc inherits Virtual PC metadata", async () => {
    process.env.APP_PUBLIC_ORIGIN = "https://coolify.example.com";

    const response = await createOgShareResponse(
      new Request("http://127.0.0.1:4010/infinite-pc")
    );

    expect(response).not.toBeNull();
    const body = await response!.text();
    expect(body).toContain(
      '<meta property="og:title" content="Virtual PC on ryOS">'
    );
    expect(body).toContain(
      '<meta property="og:image" content="https://coolify.example.com/icons/macosx/infinite-pc.png">'
    );
  });

  test("/listen sessions keep small Twitter card with Karaoke icon", async () => {
    process.env.APP_PUBLIC_ORIGIN = "https://coolify.example.com";

    const response = await createOgShareResponse(
      new Request("http://127.0.0.1:4010/listen/abc123")
    );

    expect(response).not.toBeNull();
    const body = await response!.text();
    expect(body).toContain('<meta name="twitter:card" content="summary">');
    expect(body).toContain(
      '<meta property="og:image" content="https://coolify.example.com/icons/macosx/karaoke.png">'
    );
  });

  test("does not double-encode HTML entities in image URLs", async () => {
    process.env.APP_PUBLIC_ORIGIN = "https://example.com";

    const response = await createOgShareResponse(
      new Request("http://127.0.0.1:4010/finder")
    );

    const body = await response!.text();
    expect(body).not.toContain("&amp;amp;");
  });

  test("control-panels image dimensions resolve via the nested icon path", async () => {
    process.env.APP_PUBLIC_ORIGIN = "https://coolify.example.com";

    const response = await createOgShareResponse(
      new Request("http://127.0.0.1:4010/control-panels")
    );

    const body = await response!.text();
    expect(body).toContain(
      '<meta property="og:image" content="https://coolify.example.com/icons/macosx/control-panels/appearance-manager/app.png">'
    );
    expect(body).toContain('<meta property="og:image:width" content="128">');
    expect(body).toContain('<meta property="og:image:height" content="128">');
  });
});
