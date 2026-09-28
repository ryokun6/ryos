/**
 * Post-build guard for the first-load JavaScript: the entry script plus every
 * chunk `dist/index.html` modulepreloads. Fails when a lazy vendor chunk
 * (tiptap, audio, three, …) lands on the boot path or the boot scripts exceed
 * the gzip budget.
 *
 * Usage: bun run inspect:boot [--list]
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { LAZY_VENDOR_CHUNK_NAMES } from "../vite/vendorChunks";

// Measured ~370 KiB after keeping lazy vendors off the boot path; the
// headroom still catches a lazy vendor chunk (tiptap alone is ~145 KiB)
// sneaking back in.
export const MAX_BOOT_GZIP_BYTES = 450 * 1024;

const TAG_RE = /<(?:script|link)\b[^>]*>/gi;

function attribute(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`, "i"))?.[1];
}

/** Entry module scripts followed by modulepreloaded chunks, in document order. */
export function collectBootScripts(html: string): string[] {
  const scripts: string[] = [];
  for (const [tag] of html.matchAll(TAG_RE)) {
    const isEntry =
      tag.toLowerCase().startsWith("<script") &&
      attribute(tag, "type") === "module";
    const isPreload =
      tag.toLowerCase().startsWith("<link") &&
      attribute(tag, "rel") === "modulepreload";
    const url = isEntry
      ? attribute(tag, "src")
      : isPreload
        ? attribute(tag, "href")
        : undefined;
    if (url?.endsWith(".js") && !scripts.includes(url)) scripts.push(url);
  }
  return scripts;
}

/** Boot scripts emitted by one of the lazy vendor groups (`<name>-<hash>.js`). */
export function findLazyVendorChunks(
  scripts: readonly string[],
  lazyChunkNames: readonly string[] = LAZY_VENDOR_CHUNK_NAMES
): string[] {
  const names = new Set(lazyChunkNames);
  return scripts.filter((url) => {
    const chunkName = path.basename(url).match(/^(.+)-[\w-]{8}\.js$/)?.[1];
    return chunkName !== undefined && names.has(chunkName);
  });
}

if (import.meta.main) {
  const distRoot = path.join(process.cwd(), "dist");
  const indexPath = path.join(distRoot, "index.html");
  if (!existsSync(indexPath)) {
    console.error("[boot] dist/index.html is missing; run bun run build first");
    process.exit(1);
  }

  const scripts = collectBootScripts(readFileSync(indexPath, "utf8"));
  if (scripts.length === 0) {
    console.error("[boot] No entry script found in dist/index.html");
    process.exit(1);
  }

  let rawBytes = 0;
  let gzipBytes = 0;
  const rows: Array<{ url: string; raw: number; gzip: number }> = [];
  for (const url of scripts) {
    const filePath = path.join(distRoot, url.split(/[?#]/)[0]);
    if (!existsSync(filePath)) {
      console.error(`[boot] ${url} is referenced by index.html but missing`);
      process.exit(1);
    }
    const contents = readFileSync(filePath);
    const gzip = gzipSync(contents).length;
    rawBytes += contents.length;
    gzipBytes += gzip;
    rows.push({ url, raw: contents.length, gzip });
  }

  console.log(
    `[boot] JavaScript: ${scripts.length} files, ${(rawBytes / 1024).toFixed(1)} KiB, ` +
      `${(gzipBytes / 1024).toFixed(1)} KiB gzip`
  );
  if (process.argv.includes("--list")) {
    for (const { url, raw, gzip } of rows.toSorted((a, b) => b.raw - a.raw)) {
      console.log(
        `${(raw / 1024).toFixed(1).padStart(8)} KiB ${(gzip / 1024).toFixed(1).padStart(7)} KiB gzip  ${url}`
      );
    }
  }

  const lazyOnBoot = findLazyVendorChunks(scripts);
  if (lazyOnBoot.length > 0) {
    console.error(
      `[boot] Lazy vendor chunks are on the boot path: ${lazyOnBoot.join(", ")}. ` +
        "A boot module was probably captured by a lazy group; see vite/vendorChunks.ts."
    );
    process.exit(1);
  }

  if (gzipBytes > MAX_BOOT_GZIP_BYTES) {
    console.error(
      `[boot] Boot JavaScript budget exceeded (max ${MAX_BOOT_GZIP_BYTES / 1024} KiB gzip)`
    );
    process.exit(1);
  }
}
