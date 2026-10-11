#!/usr/bin/env bun
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { loadDatasetBytes } from "../../../api/dictionary/_helpers/_datasets";
import {
  DATASET_DOWNLOAD_ATTEMPTS,
  WORDNET_NLTK_URL,
  WORDNET_PRINCETON_URL,
  datasetMirrors,
  fetchDatasetBytes,
} from "../../../api/dictionary/_helpers/_dataset-sources";

const sleep = async () => {};
const previousDataDir = process.env.DICTIONARY_DATA_DIR;

afterEach(() => {
  if (previousDataDir === undefined) delete process.env.DICTIONARY_DATA_DIR;
  else process.env.DICTIONARY_DATA_DIR = previousDataDir;
});

describe("dictionary dataset downloads", () => {
  test("uses the NLTK zip before Princeton's tarball", () => {
    const mirrors = datasetMirrors("wordnet");
    expect(mirrors.map((mirror) => mirror.url)).toEqual([WORDNET_NLTK_URL, WORDNET_PRINCETON_URL]);
    expect(mirrors.map((mirror) => mirror.file)).toEqual(["wordnet31.zip", "wn3.1.dict.tar.gz"]);
    expect(mirrors[0]?.timeoutMs).toBeLessThanOrEqual(30_000);
    expect(mirrors[1]?.timeoutMs).toBeLessThanOrEqual(60_000);
  });

  test("retries one mirror before accepting it", async () => {
    let attempts = 0;
    const result = await fetchDatasetBytes("kengdic", {
      sleep,
      fetch: async () => {
        attempts += 1;
        if (attempts < DATASET_DOWNLOAD_ATTEMPTS) return new Response("no", { status: 503 });
        return new Response(new Uint8Array([1, 2, 3]));
      },
    });
    expect(attempts).toBe(DATASET_DOWNLOAD_ATTEMPTS);
    expect(result.file).toBe("kengdic.tsv");
    expect([...result.bytes]).toEqual([1, 2, 3]);
  });

  test("falls back from the NLTK zip to the Princeton tarball", async () => {
    const urls: string[] = [];
    const result = await fetchDatasetBytes("wordnet", {
      sleep,
      fetch: async (input) => {
        const url = String(input);
        urls.push(url);
        if (url === WORDNET_NLTK_URL) return new Response("no", { status: 502 });
        return new Response(new Uint8Array([9]));
      },
    });
    expect(urls.filter((url) => url === WORDNET_NLTK_URL)).toHaveLength(DATASET_DOWNLOAD_ATTEMPTS);
    expect(urls.filter((url) => url === WORDNET_PRINCETON_URL)).toEqual([WORDNET_PRINCETON_URL]);
    expect(result.file).toBe("wn3.1.dict.tar.gz");
  });

  test("reports a timeout after every attempt fails", async () => {
    await expect(
      fetchDatasetBytes("cedict", {
        sleep,
        fetch: async () => {
          throw new DOMException("The operation timed out.", "TimeoutError");
        },
      })
    ).rejects.toThrow(/cedict\.txt\.gz attempt 3: timed out/);
  });

  test("uses a cached archive and prefers the NLTK zip when both are present", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ryos-wordnet-"));
    await mkdir(dir, { recursive: true });
    process.env.DICTIONARY_DATA_DIR = dir;
    await writeFile(path.join(dir, "wn3.1.dict.tar.gz"), new Uint8Array([4, 5, 6]));
    const cachedTar = await loadDatasetBytes("wordnet", {
      fetch: async () => {
        throw new Error("should not download");
      },
    });
    expect([...cachedTar]).toEqual([4, 5, 6]);

    await writeFile(path.join(dir, "wordnet31.zip"), new Uint8Array([7, 8]));
    const cachedZip = await loadDatasetBytes("wordnet", {
      fetch: async () => {
        throw new Error("should not download");
      },
    });
    expect([...cachedZip]).toEqual([7, 8]);
  });
});
