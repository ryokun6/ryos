/**
 * Consolidated dark-mode / macOS theme CSS regression pins.
 *
 * Formerly split across link-preview-dark, tool-call-shimmer-dark,
 * chat-scroll-to-bottom-dark, ie-loading-bar-dark, and ie-favorites-macosx-theme.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  aquaThemeCss,
  darkAquaThemeCss,
  extractRuleBlock,
  indexCss,
} from "../../helpers/theme-css-fixtures";

const readSrc = (relativePath: string): string =>
  readFileSync(join(import.meta.dir, "../../../src", relativePath), "utf8");

const loadingSource = readSrc(
  "components/shared/link-preview/components/LinkPreviewLoading.tsx"
);
const previewSource = readSrc("components/shared/link-preview/LinkPreview.tsx");
const actionButtonsSource = readSrc(
  "components/shared/link-preview/components/LinkPreviewActionButtons.tsx"
);
const scrollButtonSource = readSrc(
  "apps/chats/components/chat-messages/ScrollToBottomButton.tsx"
);
const contentPaneSource = readSrc(
  "apps/internet-explorer/components/internet-explorer-app/InternetExplorerContentPane.tsx"
);
const favoritesBarSource = readSrc(
  "apps/internet-explorer/components/internet-explorer-app/InternetExplorerFavoritesBar.tsx"
);

describe("link preview dark mode styling", () => {
  test("loading component uses shared skeleton class and macOS bubble shell", () => {
    expect(loadingSource).toContain("link-preview-loading-skeleton");
    expect(loadingSource).toContain("macosx-link-preview");
    expect(loadingSource).toContain("rounded-[16px]");
    expect(loadingSource).toContain("useThemeFlags");
    // macOS: shimmer on the bubble root (chat-bubble > * breaks absolute children)
    expect(loadingSource).toContain(
      "chat-bubble macosx-link-preview rounded-[16px] border-none shadow-none link-preview-loading-skeleton"
    );
    expect(loadingSource).toContain("!isMacOSTheme");
  });

  test("loaded macOS link preview uses 16px radius to match chat image previews", () => {
    expect(previewSource).toContain("rounded-[16px]");
  });

  test(".dark .link-preview-loading-skeleton avoids bright white sweep", () => {
    const block = extractRuleBlock(indexCss, ".dark .link-preview-loading-skeleton");
    expect(block.length).toBeGreaterThan(0);
    expect(block).not.toMatch(/#fff\b/i);
    expect(block).not.toMatch(/rgba\(\s*250\s*,\s*250\s*,\s*250/i);
    expect(block).toContain("rgba(82, 82, 91");
  });

  test("light skeleton keeps a brighter highlight for light themes", () => {
    const block = extractRuleBlock(indexCss, ".link-preview-loading-skeleton {");
    expect(block).toContain("rgba(250, 250, 250");
  });

  test("loaded card shell has dark surface tokens", () => {
    expect(previewSource).toContain("dark:bg-neutral-950");
    expect(previewSource).toContain("dark:border-neutral-700");
    expect(previewSource).toContain("dark:bg-neutral-800/90");
  });

  test("macOS loading hides bubble gloss pseudo-elements so skeleton shimmer shows", () => {
    expect(aquaThemeCss).toContain(
      ".link-preview-loading.macosx-link-preview.chat-bubble:before"
    );
    expect(aquaThemeCss).toContain("display: none");
    expect(aquaThemeCss).toContain(".link-preview-loading.macosx-link-preview.chat-bubble");
    expect(aquaThemeCss).toContain("padding: 0 !important");
  });

  test("macOS themes enforce 16px radius on link preview cards and loading shells", () => {
    expect(aquaThemeCss).toContain(
      ".macosx-link-preview.chat-bubble.link-preview-container"
    );
    expect(aquaThemeCss).toContain(
      ".macosx-link-preview.chat-bubble.link-preview-loading"
    );
    expect(aquaThemeCss).toContain("border-radius: 16px !important");
  });

  test("action row divider uses OS separator tokens on macOS", () => {
    expect(actionButtonsSource).toContain("link-preview-actions-divider");
    expect(actionButtonsSource).toContain("var(--os-color-separator)");
    expect(actionButtonsSource).toContain("isMacOSTheme");
    expect(aquaThemeCss).toContain(".macosx-link-preview .link-preview-actions-divider");
  });
});

describe("tool call loading shimmer (dark mode)", () => {
  test("light .shimmer keeps a bright highlight for light themes", () => {
    const block = extractRuleBlock(indexCss, ".shimmer {");
    expect(block).toContain("#fff");
    expect(block).not.toContain(".dark");
  });

  test(".dark .shimmer uses subdued grays without pure white", () => {
    const block = extractRuleBlock(indexCss, ".dark .shimmer");
    expect(block.length).toBeGreaterThan(0);
    expect(block).not.toMatch(/#fff\b/i);
    expect(block).not.toMatch(/rgb\(\s*255\s*,\s*255\s*,\s*255/i);
    expect(block).toContain("rgba(212, 212, 212");
  });

  test(".dark .shimmer-gray avoids black highlight peaks", () => {
    const block = extractRuleBlock(indexCss, ".dark .shimmer-gray");
    expect(block.length).toBeGreaterThan(0);
    expect(block).not.toMatch(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*1\s*\)/);
    expect(block).toContain("rgba(212, 212, 212");
  });
});

describe("Chats scroll-to-bottom in macOS Aqua dark mode", () => {
  test("ScrollToBottomButton uses white chevron and dark pill hook class in dark mode", () => {
    expect(scrollButtonSource).toContain("chat-scroll-to-bottom-btn");
    expect(scrollButtonSource).toContain("isDarkMode");
    expect(scrollButtonSource).toContain('"text-white"');
    expect(scrollButtonSource).toContain("text-black/70");
    expect(scrollButtonSource).not.toContain("chat-scroll-to-bottom-glyph");
  });

  test("dark-aqua.css darkens scroll pill and tones gloss; no dark chevron pin", () => {
    expect(darkAquaThemeCss).toContain(
      ':root[data-os-theme="macosx"][data-os-color-scheme="dark"] .chat-scroll-to-bottom-btn'
    );
    expect(darkAquaThemeCss).toMatch(
      /\.chat-scroll-to-bottom-btn\s*\{[^}]*rgba\(88,\s*88,\s*90/i
    );
    expect(darkAquaThemeCss).toContain(".chat-scroll-to-bottom-gloss-top");
    expect(darkAquaThemeCss).toContain(".chat-scroll-to-bottom-gloss-bottom");
    expect(darkAquaThemeCss).not.toContain(".chat-scroll-to-bottom-glyph");
  });
});

describe("internet explorer loading bar dark mode", () => {
  test("loading bar track is transparent so it works in light and dark", () => {
    expect(contentPaneSource).toContain("bg-transparent backdrop-blur-sm");
    // No fixed white track that would look wrong in dark mode.
    expect(contentPaneSource).not.toContain("bg-white/75");
  });

  test("loading status bar gets a dark surface and divider", () => {
    expect(contentPaneSource).toContain("bg-neutral-100 dark:bg-neutral-900");
    expect(contentPaneSource).toContain(
      "border-t border-neutral-300 dark:border-white/10"
    );
  });

  test("indeterminate sweep keeps the background-size needed to animate", () => {
    // Regression guard: the sweep animates background-position over a
    // 200% 100% gradient; a `background:` shorthand override would reset
    // background-size and stop the animation.
    const block = extractRuleBlock(indexCss, ".animate-progress-indeterminate {");
    expect(block).toContain("background-size: 200% 100%");
    expect(block).toContain("progress-indeterminate 2.5s linear infinite");
  });
});

describe("Internet Explorer favorites bar (macosx theme)", () => {
  test("favorites bar buttons use stable hook class for macOS typography override", () => {
    expect(favoritesBarSource).toContain("ie-favorites-bar-button");
    expect(favoritesBarSource).toContain("text-[10px]");
  });

  test("aqua.css shrinks macosx bookmark bar text without matching url bar size", () => {
    expect(aquaThemeCss).toContain(
      ':root[data-os-theme="macosx"] button.ie-favorites-bar-button'
    );
    expect(aquaThemeCss).toMatch(
      /button\.ie-favorites-bar-button[\s\S]*?font-size:\s*11px\s*!important/
    );
    expect(aquaThemeCss).not.toContain("hover\\:bg-gray-200.font-geneva-12");
  });
});
