import { describe, expect, test } from "bun:test";
import {
  sortTracksLikeServerOrder,
  type IpodTrackSortFields,
} from "../src/stores/ipodTrackOrder";

function t(
  id: string,
  createdAt?: number,
  importOrder?: number
): IpodTrackSortFields {
  return { id, createdAt, importOrder };
}

describe("sortTracksLikeServerOrder", () => {
  test("orders newest createdAt first, then importOrder", () => {
    const a = t("a", 100, 0);
    const b = t("b", 200, 0);
    const c = t("c", 200, 1);
    const sorted = sortTracksLikeServerOrder([a, b, c]);
    expect(sorted.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  test("when createdAt ties and importOrder ties, preserves input order", () => {
    const a = t("a", 50, 0);
    const b = t("b", 50, 0);
    expect(sortTracksLikeServerOrder([a, b]).map((x) => x.id)).toEqual(["a", "b"]);
    expect(sortTracksLikeServerOrder([b, a]).map((x) => x.id)).toEqual(["b", "a"]);
  });
});
