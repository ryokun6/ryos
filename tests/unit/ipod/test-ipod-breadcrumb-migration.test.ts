import { describe, expect, test } from "bun:test";
import { sanitizePersistedIpodStateForRehydrate } from "../../../src/stores/useIpodStore";

describe("persisted iPod breadcrumb migration", () => {
  test("rewrites legacy Radio title breadcrumbs to kind radio", () => {
    const sanitized = sanitizePersistedIpodStateForRehydrate({
      ipodMenuBreadcrumb: [{ title: "Radio", selectedIndex: 0 }],
    });

    expect(sanitized.ipodMenuBreadcrumb?.[0]?.kind).toBe("radio");
    expect(sanitized.ipodMenuBreadcrumb?.[0]?.title).toBe("Radio");
  });
});
