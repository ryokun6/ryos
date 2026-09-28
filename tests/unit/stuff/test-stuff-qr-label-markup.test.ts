import { describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import {
  encodeStuffId,
  renderStuffIdQrSvg,
} from "../../../src/apps/stuff/utils/printLabels";

if (typeof document === "undefined") {
  GlobalRegistrator.register();
}

function describeSvg(markup: string) {
  const host = document.createElement("div");
  host.innerHTML = markup;
  const svg = host.querySelector("svg");
  return {
    svgCount: host.querySelectorAll("svg").length,
    width: svg?.getAttribute("width"),
    height: svg?.getAttribute("height"),
    viewBox: svg?.getAttribute("viewBox"),
    role: svg?.getAttribute("role"),
    paths: Array.from(host.querySelectorAll("path")).map((path) => ({
      fill: path.getAttribute("fill"),
      d: path.getAttribute("d"),
      shapeRendering: path.getAttribute("shape-rendering"),
    })),
  };
}

describe("Stuff QR label markup", () => {
  test("client-rendered QR SVG matches the static server markup", () => {
    for (const [kind, id, size] of [
      ["item", "abc-123", 128],
      ["tag", "kitchen", 96],
    ] as const) {
      const expected = renderToStaticMarkup(
        createElement(QRCodeSVG, {
          value: encodeStuffId(kind, id),
          size,
          level: "M",
          includeMargin: true,
        })
      );
      const actual = describeSvg(renderStuffIdQrSvg(kind, id, size));

      expect(actual).toEqual(describeSvg(expected));
      expect(actual.svgCount).toBe(1);
      expect(actual.width).toBe(String(size));
      expect(actual.paths).toHaveLength(2);
      expect(actual.paths[1].d?.length ?? 0).toBeGreaterThan(100);
    }
  });
});
