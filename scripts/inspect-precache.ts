import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const DIST_ROOT = path.join(process.cwd(), "dist");
const SERVICE_WORKER_PATH = path.join(DIST_ROOT, "sw.js");

if (!existsSync(SERVICE_WORKER_PATH)) {
  console.error("[precache] dist/sw.js is missing; run bun run build first");
  process.exit(1);
}

const serviceWorker = readFileSync(SERVICE_WORKER_PATH, "utf8");
const urls = [
  ...serviceWorker.matchAll(/\{url:"([^"]+)",revision:(?:"[^"]+"|null)\}/g),
].map((match) => match[1]);

function fileBytes(url: string): number {
  const filePath = path.join(DIST_ROOT, url.split(/[?#]/)[0]);
  return existsSync(filePath) ? statSync(filePath).size : 0;
}

function summarize(label: string, entries: string[]) {
  const bytes = entries.reduce((total, url) => total + fileBytes(url), 0);
  console.log(
    `[precache] ${label}: ${entries.length} files, ${(bytes / 1024).toFixed(1)} KiB`
  );
}

const javascript = urls.filter((url) => url.endsWith(".js"));
const stylesheets = urls.filter((url) => url.endsWith(".css"));
const fonts = urls.filter((url) => /\.(?:woff2?|ttf|otf)$/i.test(url));
const totalBytes = urls.reduce((total, url) => total + fileBytes(url), 0);
const forbidden = urls.filter((url) =>
  /(?:^|\/)(?:ai-sdk|audio|hangul|media-player|mermaid|pusher|shiki|streamdown|three|tiptap|v86|webamp|translation)(?:[-.])/i.test(
    url
  )
);

summarize("total", urls);
summarize("JavaScript", javascript);
summarize("CSS", stylesheets);
summarize("font binaries", fonts);

if (process.argv.includes("--list")) {
  for (const url of javascript) {
    console.log(url);
  }
}

if (urls.length === 0) {
  console.error("[precache] No entries found in the service worker manifest");
  process.exit(1);
}

if (forbidden.length > 0) {
  console.error("[precache] Optional chunks leaked into the install manifest:");
  for (const url of forbidden) {
    console.error(`  - ${url}`);
  }
  process.exit(1);
}

if (fonts.length > 0) {
  console.error("[precache] Font binaries must load by active theme, not install");
  process.exit(1);
}

if (urls.length > 25 || javascript.length > 10 || totalBytes > 3 * 1024 * 1024) {
  console.error(
    "[precache] Shell budget exceeded (max 25 files, 10 scripts, 3 MiB)"
  );
  process.exit(1);
}
