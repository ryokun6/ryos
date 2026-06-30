import { describe, expect, test } from "bun:test";
import {
  getDefaultFileApp,
  getOpenWithApps,
  resolvePreviewKind,
} from "../src/utils/fileAssociations";

describe("file associations", () => {
  test("opens raster images in Preview by default with Paint available", () => {
    const file = { path: "/Images/photo.png", name: "photo.png", type: "png" };

    expect(getDefaultFileApp(file)).toBe("preview");
    expect(getOpenWithApps(file)).toEqual(["preview", "paint"]);
  });

  test("keeps plain text and Markdown associated with TextEdit", () => {
    expect(
      getDefaultFileApp({
        path: "/Documents/notes.txt",
        type: "text/plain",
      }),
    ).toBe("textedit");
    expect(getDefaultFileApp({ path: "/Documents/readme.md" })).toBe(
      "textedit",
    );
    expect(getOpenWithApps({ path: "/Documents/readme.md" })).toEqual([
      "textedit",
      "preview",
    ]);
  });

  test("opens PDFs and other previewable documents in Preview", () => {
    expect(getDefaultFileApp({ path: "/Documents/guide.pdf" })).toBe(
      "preview",
    );
    expect(getDefaultFileApp({ path: "/Documents/data.json" })).toBe(
      "preview",
    );
    expect(getDefaultFileApp({ path: "/Documents/archive.bin" })).toBe(
      "preview",
    );
    expect(getOpenWithApps({ path: "/Documents/guide.pdf" })).toEqual([
      "preview",
    ]);
  });

  test("preserves dedicated Books and Applet Viewer associations", () => {
    expect(getDefaultFileApp({ path: "/Books/novel.epub" })).toBe("books");
    expect(getDefaultFileApp({ path: "/Applets/weather.html" })).toBe(
      "applet-viewer",
    );
    expect(getOpenWithApps({ path: "/Applets/weather.html" })).toEqual([
      "applet-viewer",
      "preview",
      "textedit",
    ]);
  });

  test("limits SVG files to Preview while supporting safe HTML previews", () => {
    expect(getOpenWithApps({ path: "/Images/vector.svg" })).toEqual([
      "preview",
    ]);
    expect(resolvePreviewKind("vector.svg", new Blob([], { type: "image/svg+xml" }))).toBe(
      "image",
    );
    expect(resolvePreviewKind("page.html", "<h1>Hello</h1>")).toBe("html");
  });
});
