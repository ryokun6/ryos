import { createOgShareResponse } from "./api/_utils/og-share";

const REMOVED_LEGACY_PATHS = new Set([
  "/infinite-pc",
  "/embed/infinite-pc",
]);

export const config = {
  matcher: [
    "/finder",
    "/stickies",
    "/infinite-mac",
    "/infinite-pc",
    "/embed/infinite-pc",
    "/pc",
    "/soundboard",
    "/internet-explorer",
    "/internet-explorer/:path*",
    "/chats",
    "/textedit",
    "/paint",
    "/photo-booth",
    "/minesweeper",
    "/videos",
    "/videos/:path*",
    "/ipod",
    "/ipod/:path*",
    "/karaoke",
    "/karaoke/:path*",
    "/listen/:path*",
    "/synth",
    "/terminal",
    "/applet-viewer",
    "/applet-viewer/:path*",
    "/control-panels",
    "/winamp",
    "/calendar",
    "/contacts",
    "/dashboard",
    "/maps",
    "/books",
  ],
};

export default async function middleware(request: Request) {
  const pathname = new URL(request.url).pathname;
  if (REMOVED_LEGACY_PATHS.has(pathname)) {
    return new Response("Not Found", { status: 404 });
  }

  return (await createOgShareResponse(request)) ?? undefined;
}
