#!/usr/bin/env bun

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

beforeAll(() => {
  if (typeof document === "undefined") {
    GlobalRegistrator.register();
  }
});

afterAll(() => {
  if (GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("icon resource gallery", () => {
  test("loads catalog markdown, renders cards, and filters by search text", async () => {
    document.body.innerHTML = `
      <div id="icon-resource-gallery" data-catalogs="/resources/classic-mac-icon-catalogs/system-7/catalog.md,/resources/macos-icon-catalogs/panther/catalog.md,/resources/windows-icon-catalogs/xp/catalog.md">
        <input id="icon-gallery-search">
        <select id="icon-gallery-family"><option value="">All catalogs</option></select>
        <select id="icon-gallery-category"><option value="">All categories</option></select>
        <span id="icon-gallery-count"></span>
        <div id="icon-gallery-grid"></div>
        <p id="icon-gallery-empty" hidden></p>
      </div>
    `;

    const catalogs = new Map([
      [
        "/resources/classic-mac-icon-catalogs/system-7/catalog.md",
        [
          "# System 7.5.3 icon catalog",
          "## System suitcase",
          "| Name | PNG | Source file | Source resource | Source path | Size |",
          "| --- | --- | --- | --- | --- | --- |",
          "| Generic folder (System) | `/public/resources/classic-mac-icon-catalogs/system-7/system/generic-folder-system.png` | `System` | `ICN%23/-3999` | `system7-icons/system_resources/ICN%23/-3999.png` | 32x32 |",
        ].join("\n"),
      ],
      [
        "/resources/macos-icon-catalogs/panther/catalog.md",
        [
          "# Panther icon catalog",
          "## Applications",
          "| Name | PNG | Source bundle | Source icon | Size |",
          "| --- | --- | --- | --- | --- |",
          "| Calculator | `/public/resources/macos-icon-catalogs/panther/applications/calculator.png` | `/Applications/Calculator.app` | `/Applications/Calculator.app/Contents/Resources/Calculator.icns` | 128x128 |",
          "| Internet Explorer | `/public/resources/macos-icon-catalogs/panther/applications/internet-explorer.png` | `/Applications/Internet Explorer.app` | `/Applications/Internet Explorer.app/Contents/Resources/AVI.icns` | 128x128 |",
        ].join("\n"),
      ],
      [
        "/resources/windows-icon-catalogs/xp/catalog.md",
        [
          "# Windows XP icon catalog",
          "## Dialog and UI Assets",
          "| Name | PNG | Source icon | Size | Frames |",
          "| --- | --- | --- | --- | --- |",
          "| Search Magnifier | `/public/resources/windows-icon-catalogs/xp/dialog-ui-assets/search-magnifier.png` | `/icons/wxp_23.ico` | 48x48 | 12 |",
        ].join("\n"),
      ],
    ]);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      const key = url.toString();
      const markdown = catalogs.get(key);
      if (!markdown) {
        return new Response("missing", { status: 404 });
      }
      return new Response(markdown);
    }) as typeof fetch;

    try {
      const script = readFileSync("public/docs-assets/icon-resource-gallery.js", "utf-8");
      new Function(script)();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const grid = document.getElementById("icon-gallery-grid");
      const count = document.getElementById("icon-gallery-count");
      const family = document.getElementById("icon-gallery-family") as HTMLSelectElement;
      const firstImage = grid?.querySelector("img");

      expect(grid?.querySelectorAll(".icon-card").length).toBe(4);
      expect(count?.textContent).toContain("4 of 4 icons");
      expect(family.options.length).toBe(4);
      expect(Array.from(family.options).map((option) => option.value)).toContain("System 7");
      expect(firstImage?.getAttribute("src")).toMatch(/^\/resources\//);

      const search = document.getElementById("icon-gallery-search") as HTMLInputElement;
      search.value = "magnifier";
      search.dispatchEvent(new Event("input"));

      expect(grid?.querySelectorAll(".icon-card").length).toBe(1);
      expect(grid?.textContent).toContain("Search Magnifier");
      expect(count?.textContent).toContain("1 of 3 icons");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
