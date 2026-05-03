import { createOgShareResponse } from "./api/_utils/og-share";

export const config = {
  matcher: [
    "/finder",
    "/stickies",
    "/infinite-mac",
    "/pc",
    "/infinite-pc",
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
    "/pc",
    "/terminal",
    "/applet-viewer",
    "/applet-viewer/:path*",
    "/control-panels",
    "/winamp",
    "/dashboard",
  ],
};

export default async function middleware(request: Request) {
  return (await createOgShareResponse(request)) ?? undefined;
}
