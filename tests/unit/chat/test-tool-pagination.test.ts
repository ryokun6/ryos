import { describe, expect, test } from "bun:test";
import {
  APPLETS_STORE_LIST_PAGE,
  MUSIC_LIST_PAGE,
  SONG_LIBRARY_PAGE,
  describePageRange,
  formatPaginationFooter,
  paginate,
} from "../../../src/shared/tools/pagination";
import { listSchema, songLibraryControlSchema } from "../../../api/chat/tools/schemas";

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const OPTS = { defaultLimit: 10, maxLimit: 20 };

describe("paginate", () => {
  test("empty input", () => {
    const page = paginate([], {}, OPTS);
    expect(page).toEqual({
      items: [],
      total: 0,
      offset: 0,
      limit: 10,
      returned: 0,
      hasMore: false,
      nextOffset: null,
    });
  });

  test("empty input with a non-zero offset clamps to 0", () => {
    const page = paginate([], { offset: 5, limit: 3 }, OPTS);
    expect(page.offset).toBe(0);
    expect(page.returned).toBe(0);
    expect(page.hasMore).toBe(false);
    expect(page.nextOffset).toBeNull();
  });

  test("no params uses the default page size (backward compatible)", () => {
    const page = paginate(range(25), {}, OPTS);
    expect(page.items).toEqual(range(10));
    expect(page.total).toBe(25);
    expect(page.hasMore).toBe(true);
    expect(page.nextOffset).toBe(10);
  });

  test("exact page boundary: total equals limit", () => {
    const page = paginate(range(10), { limit: 10 }, OPTS);
    expect(page.returned).toBe(10);
    expect(page.hasMore).toBe(false);
    expect(page.nextOffset).toBeNull();
  });

  test("exact page boundary: second page ends at total", () => {
    const page = paginate(range(20), { offset: 10, limit: 10 }, OPTS);
    expect(page.items).toEqual(range(20).slice(10));
    expect(page.hasMore).toBe(false);
    expect(page.nextOffset).toBeNull();
  });

  test("offset equal to total returns an empty last page", () => {
    const page = paginate(range(10), { offset: 10, limit: 5 }, OPTS);
    expect(page.items).toEqual([]);
    expect(page.offset).toBe(10);
    expect(page.hasMore).toBe(false);
    expect(page.nextOffset).toBeNull();
  });

  test("last partial page", () => {
    const page = paginate(range(23), { offset: 20, limit: 10 }, OPTS);
    expect(page.items).toEqual([20, 21, 22]);
    expect(page.returned).toBe(3);
    expect(page.total).toBe(23);
    expect(page.hasMore).toBe(false);
    expect(page.nextOffset).toBeNull();
  });

  test("walking nextOffset visits every item exactly once", () => {
    const items = range(47);
    const seen: number[] = [];
    let offset: number | null = 0;
    let calls = 0;
    while (offset !== null) {
      const page = paginate(items, { offset, limit: 10 }, OPTS);
      seen.push(...page.items);
      offset = page.nextOffset;
      calls += 1;
    }
    expect(seen).toEqual(items);
    expect(calls).toBe(5);
  });

  test("clamps limit to maxLimit and offset past the end to total", () => {
    const page = paginate(range(100), { offset: 500, limit: 999 }, OPTS);
    expect(page.limit).toBe(20);
    expect(page.offset).toBe(100);
    expect(page.returned).toBe(0);
  });

  test("ignores invalid numbers", () => {
    const page = paginate(range(5), { offset: -3, limit: Number.NaN }, OPTS);
    expect(page.offset).toBe(0);
    expect(page.limit).toBe(10);
    expect(page.returned).toBe(5);
  });

  test("tool page presets keep the historical defaults", () => {
    expect(MUSIC_LIST_PAGE).toEqual({ defaultLimit: 50, maxLimit: 100 });
    expect(APPLETS_STORE_LIST_PAGE).toEqual({ defaultLimit: 50, maxLimit: 100 });
    expect(SONG_LIBRARY_PAGE).toEqual({ defaultLimit: 5, maxLimit: 25 });
  });
});

describe("pagination formatting", () => {
  test("describePageRange is empty when a single page holds everything", () => {
    expect(describePageRange(paginate(range(3), {}, OPTS))).toBe("");
    expect(describePageRange(paginate([], {}, OPTS))).toBe("");
  });

  test("describePageRange reports the 1-based range", () => {
    expect(describePageRange(paginate(range(23), { offset: 20 }, OPTS))).toBe(
      "; showing 21-23 of 23"
    );
  });

  test("footer is bracket-free JSON and hints at nextOffset", () => {
    const page = paginate(range(30), { limit: 10 }, OPTS);
    const footer = formatPaginationFooter(page);
    expect(footer).not.toMatch(/[[\]]/);
    expect(footer).toContain("call again with offset 10");
    const json = footer.match(/Pagination: (\{.*?\})/)?.[1];
    expect(JSON.parse(json ?? "null")).toEqual({
      total: 30,
      offset: 0,
      limit: 10,
      returned: 10,
      hasMore: true,
      nextOffset: 10,
    });
  });

  test("an item array followed by the footer still parses as the list result", () => {
    const page = paginate(
      [{ title: "Song [Live]" }, { title: "Other" }],
      {},
      OPTS
    );
    const output = `Found 2 songs:\n${JSON.stringify(page.items, null, 2)}${formatPaginationFooter(page)}`;
    const match = output.match(/:\n(\[.*\])/s);
    expect(JSON.parse(match?.[1] ?? "null")).toEqual(page.items);
  });
});

describe("list tool schemas accept paging params", () => {
  test("list accepts offset and rejects negatives / oversized pages", () => {
    expect(listSchema.safeParse({ path: "/Music" }).success).toBe(true);
    expect(listSchema.safeParse({ path: "/Music", offset: 100, limit: 100 }).success).toBe(true);
    expect(listSchema.safeParse({ path: "/Applets Store", limit: 100 }).success).toBe(true);
    expect(listSchema.safeParse({ path: "/Music", offset: -1 }).success).toBe(false);
    expect(listSchema.safeParse({ path: "/Music", limit: 101 }).success).toBe(false);
  });

  test("songLibraryControl accepts offset", () => {
    expect(
      songLibraryControlSchema.safeParse({ action: "list", offset: 25, limit: 25 }).success
    ).toBe(true);
    expect(
      songLibraryControlSchema.safeParse({ action: "list", offset: -1 }).success
    ).toBe(false);
  });
});
