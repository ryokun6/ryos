import { describe, expect, test } from "bun:test";
import { getStaticCacheHeaders } from "../../../scripts/static-cache-policy";

const NO_CACHE = "no-cache, no-store, must-revalidate";
const IMMUTABLE = "public, max-age=31536000, immutable";
const DEFAULT = "public, max-age=0, must-revalidate";

describe("standalone static cache policy", () => {
  test("service worker and app shell are never cacheable", () => {
    for (const file of [
      "sw.js",
      "registerSW.js",
      "index.html",
      "404.html",
      "manifest.json",
      "version.json",
      "theme-bootstrap-config.js",
      "app-config.js",
      "icons/manifest.json",
      "wallpapers/manifest.json",
    ]) {
      expect(getStaticCacheHeaders(file)["Cache-Control"]).toBe(NO_CACHE);
    }
  });

  test("data JSON files are never cacheable", () => {
    expect(getStaticCacheHeaders("data/filesystem.json")["Cache-Control"]).toBe(
      NO_CACHE
    );
    expect(getStaticCacheHeaders("data/applets.json")["Cache-Control"]).toBe(
      NO_CACHE
    );
  });

  test("content-hashed bundles are immutable", () => {
    for (const file of [
      "assets/index-DtdH3Hje.js",
      "assets/index-Cw_Oi01Q.css",
      "assets/Sun.es-CFTCQksY.js",
      "assets/mermaid-GHXKKRXX-BFc4ptNZ.js",
      "workbox-7ddec154.js",
    ]) {
      expect(getStaticCacheHeaders(file)["Cache-Control"]).toBe(IMMUTABLE);
    }
  });

  test("unhashed public files under assets/ are revalidated", () => {
    for (const file of [
      "assets/button.svg",
      "assets/button-default.svg",
      "assets/brushed-metal.jpg",
      "assets/books/meditations-marcus-aurelius.epub",
    ]) {
      expect(getStaticCacheHeaders(file)["Cache-Control"]).toBe(DEFAULT);
    }
  });

  test("static asset folders get immutable caching", () => {
    for (const file of [
      "wallpapers/photos/foo.jpg",
      "wallpapers/tiles/bar.png",
      "wallpapers/thumbs/foo.jpg",
      "wallpapers/videos/foo.mp4",
      "icons/default/file.png",
      "icons/macosx/file.png",
      "sounds/click.mp3",
      "patterns/pattern.png",
      "assets/games/jsdos/game.zip",
      "apple-touch-icon.png",
      "favicon.ico",
    ]) {
      expect(getStaticCacheHeaders(file)["Cache-Control"]).toBe(IMMUTABLE);
    }
  });

  test("fonts are immutable with CORS enabled", () => {
    const headers = getStaticCacheHeaders("fonts/LucidaGrande.woff2");
    expect(headers["Cache-Control"]).toBe(IMMUTABLE);
    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  test("wallpaper placeholders use stale-while-revalidate", () => {
    expect(
      getStaticCacheHeaders("wallpapers/placeholders.json")["Cache-Control"]
    ).toBe("public, max-age=86400, stale-while-revalidate=604800");
  });

  test("docs pages and other files default to revalidation", () => {
    expect(getStaticCacheHeaders("docs/overview.html")["Cache-Control"]).toBe(
      DEFAULT
    );
    expect(getStaticCacheHeaders("emoji/smile.png")["Cache-Control"]).toBe(
      DEFAULT
    );
  });
});
