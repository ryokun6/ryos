import { describe, expect, test } from "bun:test";
import type { TFunction } from "i18next";
import {
  stuffDefaultTagSlug,
  stuffTagDisplayName,
} from "../../../src/apps/stuff/utils/stuffTagDisplayName";
import type { StuffTag } from "../../../src/apps/stuff/types";

const t = ((key: string, opts?: { defaultValue?: string }) => {
  if (key === "apps.stuff.defaultTags.books") return "Libros";
  if (key === "apps.stuff.defaultTags.cd") return "CD";
  return opts?.defaultValue ?? key;
}) as TFunction;

function tag(partial: Partial<StuffTag> & Pick<StuffTag, "id" | "name">): StuffTag {
  return {
    color: "#000",
    createdAt: 1,
    ...partial,
  };
}

describe("stuffTagDisplayName", () => {
  test("localizes stable default ids", () => {
    expect(
      stuffTagDisplayName(
        tag({ id: "stuff-default:books", name: "Books" }),
        t
      )
    ).toBe("Libros");
  });

  test("localizes by canonical English name for legacy ids", () => {
    expect(stuffDefaultTagSlug(tag({ id: "uuid", name: "Kitchen" }))).toBe(
      "kitchen"
    );
  });

  test("keeps custom tag names", () => {
    expect(
      stuffTagDisplayName(tag({ id: "custom", name: "Vintage" }), t)
    ).toBe("Vintage");
  });

  test("recognizes CD default slug", () => {
    expect(stuffDefaultTagSlug(tag({ id: "stuff-default:cd", name: "CD" }))).toBe(
      "cd"
    );
    expect(
      stuffTagDisplayName(tag({ id: "stuff-default:cd", name: "CD" }), t)
    ).toBe("CD");
  });
});
