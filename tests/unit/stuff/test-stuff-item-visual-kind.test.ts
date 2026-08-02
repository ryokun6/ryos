import { describe, expect, test } from "bun:test";
import {
  isStuffCdItem,
  resolveStuffItemVisualKind,
} from "../../../src/apps/stuff/utils/stuffItemVisualKind";
import type { StuffItem, StuffTag } from "../../../src/apps/stuff/types";

function tag(partial: Partial<StuffTag> & Pick<StuffTag, "id" | "name">): StuffTag {
  return {
    color: "#888888",
    createdAt: 1,
    ...partial,
  };
}

function item(tagIds: string[]): StuffItem {
  return {
    id: "item-1",
    title: "Test Item",
    brand: "Artist",
    notes: "",
    tagIds,
    status: "in_use",
    prices: { currency: "USD" },
    quantity: 1,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("resolveStuffItemVisualKind", () => {
  test("maps default CD tag id to cd even if renamed", () => {
    const tags = [tag({ id: "stuff-default:cd", name: "Albums" })];
    expect(resolveStuffItemVisualKind(item(["stuff-default:cd"]), tags)).toBe(
      "cd"
    );
    expect(isStuffCdItem(item(["stuff-default:cd"]), tags)).toBe(true);
  });

  test("maps cd / compact disc tag names to cd", () => {
    expect(
      resolveStuffItemVisualKind(item(["t1"]), [tag({ id: "t1", name: "CD" })])
    ).toBe("cd");
    expect(
      resolveStuffItemVisualKind(item(["t1"]), [
        tag({ id: "t1", name: "Compact Disc" }),
      ])
    ).toBe("cd");
  });

  test("keeps movies / music as media product tiles", () => {
    expect(
      resolveStuffItemVisualKind(item(["t1"]), [
        tag({ id: "t1", name: "Movies" }),
      ])
    ).toBe("media");
    expect(
      resolveStuffItemVisualKind(item(["t1"]), [tag({ id: "t1", name: "Music" })])
    ).toBe("media");
  });

  test("prefers book over cd when both tags present", () => {
    const tags = [
      tag({ id: "stuff-default:books", name: "Books" }),
      tag({ id: "stuff-default:cd", name: "CD" }),
    ];
    expect(
      resolveStuffItemVisualKind(
        item(["stuff-default:books", "stuff-default:cd"]),
        tags
      )
    ).toBe("book");
  });

  test("prefers cd over generic media", () => {
    const tags = [
      tag({ id: "t-cd", name: "CD" }),
      tag({ id: "t-media", name: "Media" }),
    ];
    expect(
      resolveStuffItemVisualKind(item(["t-cd", "t-media"]), tags)
    ).toBe("cd");
  });
});
