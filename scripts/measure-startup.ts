import { existsSync } from "node:fs";
import { chromium, type Page } from "playwright";

type StartupSample = {
  theme: string;
  phase: "load" | "idle";
  ttfbMs: number;
  domContentLoadedMs: number;
  loadMs: number;
  firstContentfulPaintMs: number | null;
  scriptRequests: number;
  stylesheetRequests: number;
  imageRequests: number;
  fontRequests: string[];
  sameOriginTransferKiB: number;
};

const urlArgument = process.argv.find((argument) =>
  argument.startsWith("--url=")
);
const targetUrl = urlArgument?.slice("--url=".length) ?? "http://127.0.0.1:4173";
const themes = ["macosx", "system7"] as const;

async function readSample(
  page: Page,
  theme: string,
  phase: StartupSample["phase"]
): Promise<StartupSample> {
  return page.evaluate(
    ({ activeTheme, activePhase }) => {
      const navigation = performance.getEntriesByType(
        "navigation"
      )[0] as PerformanceNavigationTiming;
      const resources = performance.getEntriesByType(
        "resource"
      ) as PerformanceResourceTiming[];
      const sameOrigin = resources.filter(
        (entry) => new URL(entry.name).origin === location.origin
      );
      const firstContentfulPaint =
        performance.getEntriesByName("first-contentful-paint")[0];

      return {
        theme: activeTheme,
        phase: activePhase,
        ttfbMs: navigation.responseStart,
        domContentLoadedMs: navigation.domContentLoadedEventEnd,
        loadMs: navigation.loadEventEnd,
        firstContentfulPaintMs: firstContentfulPaint?.startTime ?? null,
        scriptRequests: sameOrigin.filter(
          (entry) => entry.initiatorType === "script"
        ).length,
        stylesheetRequests: sameOrigin.filter(
          (entry) =>
            entry.initiatorType === "link" && entry.name.endsWith(".css")
        ).length,
        imageRequests: sameOrigin.filter(
          (entry) => entry.initiatorType === "img"
        ).length,
        fontRequests: sameOrigin
          .filter((entry) => /\.(?:woff2?|ttf|otf)$/i.test(entry.name))
          .map((entry) => new URL(entry.name).pathname),
        sameOriginTransferKiB:
          sameOrigin.reduce(
            (total, entry) =>
              total + (entry.transferSize || entry.encodedBodySize),
            0
          ) / 1024,
      };
    },
    { activeTheme: theme, activePhase: phase }
  );
}

const installedChromium = chromium.executablePath();
const executablePath = existsSync(installedChromium)
  ? undefined
  : ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome"].find(existsSync);
const browser = await chromium.launch({ headless: true, executablePath });
const samples: StartupSample[] = [];

try {
  for (const theme of themes) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    await page.addInitScript((activeTheme) => {
      localStorage.setItem("ryos:theme", activeTheme);
    }, theme);

    const response = await page.goto(targetUrl, { waitUntil: "load" });
    if (!response?.ok()) {
      throw new Error(`${theme} navigation failed with ${response?.status()}`);
    }
    await page.locator("#root > *").first().waitFor({ state: "visible" });
    samples.push(await readSample(page, theme, "load"));
    await page.waitForTimeout(1_500);
    samples.push(await readSample(page, theme, "idle"));
    await context.close();
  }
} finally {
  await browser.close();
}

for (const sample of samples.filter(({ phase }) => phase === "load")) {
  console.log(
    `[startup:${sample.theme}] TTFB ${sample.ttfbMs.toFixed(1)} ms, FCP ${
      sample.firstContentfulPaintMs?.toFixed(1) ?? "n/a"
    } ms, DCL ${sample.domContentLoadedMs.toFixed(1)} ms, load ${sample.loadMs.toFixed(1)} ms`
  );
}

for (const sample of samples) {
  console.log(
    `[startup:${sample.theme}:${sample.phase}] ${sample.scriptRequests} scripts, ${sample.stylesheetRequests} stylesheets, ${sample.imageRequests} images, ${sample.sameOriginTransferKiB.toFixed(1)} KiB transferred`
  );
  console.log(
    `[startup:${sample.theme}:${sample.phase}] fonts ${sample.fontRequests.join(", ")}`
  );
}

const macosxFonts = samples.find(
  (sample) => sample.theme === "macosx" && sample.phase === "idle"
)?.fontRequests;
const system7Fonts = samples.find(
  (sample) => sample.theme === "system7" && sample.phase === "idle"
)?.fontRequests;
if (
  !macosxFonts?.includes("/fonts/AquaKana.woff2") ||
  !system7Fonts?.includes("/fonts/fusion-pixel-12px-proportional-ja.woff2")
) {
  throw new Error("Active-theme CJK fonts were not fetched during startup");
}
