import { describe, expect, test } from "bun:test";
import {
  createSyncCodecRegistry,
  NAMESPACE_APPLY_ORDER,
} from "../src/sync/codecRegistry";
import type { SyncCodec } from "../src/sync/codecs";
import type { SyncNamespace } from "../src/shared/sync2/namespaces";

const codec = (namespace: SyncNamespace): SyncCodec => ({
  namespace,
  collect: () => new Map(),
  apply: () => {},
  subscribe: () => () => {},
});

describe("sync codec registry", () => {
  test("rejects a codec registered under the wrong namespace", () => {
    expect(() =>
      createSyncCodecRegistry({
        settings: codec("files"),
      } as Record<SyncNamespace, SyncCodec>)
    ).toThrow("registry mismatch");
  });

  test("keeps every namespace in the apply order unique", () => {
    expect(new Set(NAMESPACE_APPLY_ORDER).size).toBe(
      NAMESPACE_APPLY_ORDER.length
    );
  });
});
