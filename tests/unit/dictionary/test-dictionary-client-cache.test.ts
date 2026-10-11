#!/usr/bin/env bun
import { describe, expect, test } from "bun:test";
import {
  clearDictionaryClientCache,
  dictionaryClientCacheKey,
  readDictionaryClientCache,
  writeDictionaryClientCache,
} from "../../../src/apps/dictionary/utils/dictionaryLookupCache";
import type { DictionaryLookupResponse } from "../../../src/shared/dictionary";

function response(query: string): DictionaryLookupResponse {
  return {
    query,
    lang: "en",
    entries: [],
    phrases: [],
    similar: [],
    suggestions: [],
    sources: [],
    notFound: false,
  };
}

describe("dictionary client lookup cache", () => {
  test("repeats of the same normalized query are instant hits", () => {
    clearDictionaryClientCache();
    expect(dictionaryClientCacheKey("  Run  ", "en")).toBe("en:Run");
    writeDictionaryClientCache("  Run  ", "en", response("Run"));
    expect(readDictionaryClientCache("Run", "en")?.query).toBe("Run");
    expect(readDictionaryClientCache("run", "en")).toBeNull();
    clearDictionaryClientCache();
  });

  test("drops the least recently used lookup past the cap", () => {
    clearDictionaryClientCache();
    for (let i = 0; i < 80; i++) writeDictionaryClientCache(`w${i}`, "en", response(`w${i}`));
    expect(readDictionaryClientCache("w0", "en")?.query).toBe("w0");
    writeDictionaryClientCache("w80", "en", response("w80"));
    expect(readDictionaryClientCache("w1", "en")).toBeNull();
    expect(readDictionaryClientCache("w0", "en")?.query).toBe("w0");
    expect(readDictionaryClientCache("w80", "en")?.query).toBe("w80");
    clearDictionaryClientCache();
  });
});
