/**
 * Stuff shared-link view: long titles must truncate / clamp without blowing
 * out the header, grid cards, or selected-item chrome.
 *
 * Keep this suite free of happy-dom / mock.module — those leak across the
 * aggregate `bun run test:unit` process (see AGENTS.md cross-file pollution).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(
    import.meta.dir,
    "../../../src/apps/stuff/components/StuffSharedView.tsx"
  ),
  "utf8"
);

describe("StuffSharedView long-title layout classes", () => {
  test("root and header keep min-w-0 + truncated share title", () => {
    expect(source).toContain(
      'className="flex h-full min-w-0 flex-col overflow-hidden bg-os-window-bg"'
    );
    expect(source).toContain(
      'className="flex min-w-0 items-center gap-3 border-b border-black/10 px-3 py-2 dark:border-white/10"'
    );
    expect(source).toContain('className="truncate font-apple-garamond text-xl"');
    expect(source).toContain('className="shrink-0"');
  });

  test("grid cards use min-w-0 overflow-hidden so truncate engages", () => {
    expect(source).toContain(
      'className="grid grid-cols-[repeat(auto-fill,minmax(min(140px,100%),1fr))] gap-4"'
    );
    expect(source).toContain(
      'className="min-w-0 overflow-hidden rounded-md border border-black/10 text-left shadow-sm dark:border-white/10"'
    );
    expect(source).toContain('className="truncate text-sm font-medium"');
  });

  test("selected item title clamps and Close stays shrink-0", () => {
    expect(source).toContain('className="min-w-0 flex-1"');
    expect(source).toContain(
      'className="line-clamp-3 break-words font-apple-garamond text-lg leading-tight"'
    );
    expect(source).toContain('className="truncate text-xs opacity-60"');
  });

  test("cover fallback title clamps instead of overflowing the tile", () => {
    expect(source).toContain(
      'className="line-clamp-3 break-words font-apple-garamond text-sm leading-tight"'
    );
    expect(source).toContain(
      'className="flex h-36 items-end overflow-hidden p-2"'
    );
  });
});
