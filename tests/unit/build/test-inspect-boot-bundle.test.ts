import { describe, expect, test } from "bun:test";
import {
  collectBootScripts,
  findLazyVendorChunks,
} from "../../../scripts/inspect-boot-bundle";

const INDEX_HTML = `<!doctype html>
<html>
  <head>
    <script>document.documentElement.dataset.theme = "macosx";</script>
    <link rel="preload" href="/fonts/geneva.woff2" as="font" crossorigin>
    <script type="module" crossorigin src="/assets/index-d_232bt1.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/react-DNYdY-va.js">
    <link crossorigin rel="modulepreload" href="/assets/ui-core-D_dt2i3j.js">
    <link rel="modulepreload" crossorigin href="/assets/react-DNYdY-va.js">
    <link rel="stylesheet" crossorigin href="/assets/index-BqX1Yy2c.css">
  </head>
  <body><script src="/legacy.js"></script></body>
</html>`;

describe("boot bundle inspector", () => {
  test("collects the entry and modulepreloaded scripts once", () => {
    expect(collectBootScripts(INDEX_HTML)).toEqual([
      "/assets/index-d_232bt1.js",
      "/assets/react-DNYdY-va.js",
      "/assets/ui-core-D_dt2i3j.js",
    ]);
  });

  test("flags lazy vendor chunks by chunk name", () => {
    expect(
      findLazyVendorChunks([
        "/assets/index-d_232bt1.js",
        "/assets/react-DNYdY-va.js",
        "/assets/ui-core-D_dt2i3j.js",
        "/assets/tiptap-CTImNQpQ.js",
        "/assets/ui-extra-_JIzYVPk.js",
        "/assets/threeUtils-AbCdEf12.js",
        "/assets/audio-player-AbCdEf12.js",
      ])
    ).toEqual(["/assets/tiptap-CTImNQpQ.js", "/assets/ui-extra-_JIzYVPk.js"]);
  });
});
