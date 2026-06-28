import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const hookSource = readFileSync(
  join(
    import.meta.dir,
    "../src/apps/internet-explorer/hooks/useInternetExplorerLogic.ts"
  ),
  "utf8"
);

const contentPaneSource = readFileSync(
  join(
    import.meta.dir,
    "../src/apps/internet-explorer/components/internet-explorer-app/InternetExplorerContentPane.tsx"
  ),
  "utf8"
);

describe("internet explorer iframe navigation", () => {
  test("React owns the iframe URL to avoid duplicate top-level proxy loads", () => {
    expect(contentPaneSource).toContain("src={finalUrl ?? undefined}");
    expect(contentPaneSource).not.toContain("src={finalUrl || \"\"}");
    expect(hookSource).not.toMatch(/iframeRef\.current\.src\s*=\s*urlToLoad/);
    expect(hookSource).toContain("pendingNavigationRequestRef");
    expect(hookSource).toContain("Ignoring duplicate in-flight navigation");
    expect(hookSource).toMatch(
      /iframeRef\.current\.dataset\.navToken = newToken\.toString\(\);\s*\}\s*setFinalUrl\(urlToLoad\);/
    );
  });
});
