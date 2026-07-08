import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..", "..", "..");

describe("critical CSS and desktop icon loading", () => {
  test("loads Control Panels styles with the lazy app chunk", () => {
    const themeCss = readFileSync(
      path.join(ROOT, "src/styles/themes.css"),
      "utf8"
    );
    expect(themeCss).not.toContain("control-panels-mac.css");
    expect(themeCss).not.toContain("control-panels-themed.css");

    const controlPanelsEntry = readFileSync(
      path.join(
        ROOT,
        "src/apps/control-panels/components/control-panels-app/ControlPanelsAppComponent.tsx"
      ),
      "utf8"
    );
    expect(controlPanelsEntry).toContain(
      'import "@/styles/themes/control-panels-mac.css"'
    );
    expect(controlPanelsEntry).toContain(
      'import "@/styles/themes/control-panels-themed.css"'
    );
  });

  test("gives desktop icons stable dimensions and low network priority", () => {
    const fileIcon = readFileSync(
      path.join(ROOT, "src/apps/finder/components/FileIcon.tsx"),
      "utf8"
    );
    expect(fileIcon).toContain('decoding="async"');
    expect(fileIcon).toContain(
      'fetchPriority={isFinderContext ? "auto" : "low"}'
    );
    expect(fileIcon).toContain("width={imagePixelSize}");
    expect(fileIcon).toContain("height={imagePixelSize}");
  });
});
