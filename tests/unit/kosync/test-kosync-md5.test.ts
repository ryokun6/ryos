import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  filenameMd5FromPath,
  getKosyncServerUrl,
  md5Hex,
  partialMd5Hex,
} from "../../../src/shared/kosync/md5";
import {
  pickNewerProgress,
  shouldAcceptKosyncProgressUpdate,
} from "../../../api/kosync/_helpers/_books-bridge";
import {
  isValidKosyncField,
  isValidKosyncKeyField,
} from "../../../api/kosync/_helpers/_md5";

describe("kosync md5 helpers", () => {
  test("md5Hex matches Node crypto for ASCII strings", () => {
    const input = "hello-koreader";
    const expected = createHash("md5").update(input).digest("hex");
    expect(md5Hex(input)).toBe(expected);
  });

  test("filenameMd5FromPath hashes the basename only", () => {
    const name = "Meditations - Marcus Aurelius.epub";
    expect(filenameMd5FromPath(`/Books/${name}`)).toBe(md5Hex(name));
    expect(filenameMd5FromPath(name)).toBe(md5Hex(name));
  });

  test("partialMd5Hex samples exponentially spaced chunks", () => {
    const bytes = new Uint8Array(10_000);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 251;
    const hash = createHash("md5");
    const step = 1024;
    for (let i = -1; i <= 10; i += 1) {
      const offset = step << (2 * i);
      if (offset >= bytes.length) break;
      hash.update(bytes.subarray(offset, Math.min(offset + step, bytes.length)));
    }
    expect(partialMd5Hex(bytes)).toBe(hash.digest("hex"));
  });

  test("getKosyncServerUrl strips trailing slashes", () => {
    expect(getKosyncServerUrl("https://os.ryo.lu/")).toBe(
      "https://os.ryo.lu/api/kosync"
    );
  });

  test("md5Hex produces stable hex keys for KOReader auth payloads", () => {
    // KOReader sends md5(plain) as X-Auth-Key; compare against Node once.
    const sample = "testtest";
    expect(md5Hex(sample)).toBe(
      createHash("md5").update(sample).digest("hex")
    );
  });
});

describe("kosync field validators", () => {
  test("rejects empty or colon-containing key fields", () => {
    expect(isValidKosyncKeyField("alice")).toBe(true);
    expect(isValidKosyncKeyField("")).toBe(false);
    expect(isValidKosyncKeyField("a:b")).toBe(false);
    expect(isValidKosyncField("ok")).toBe(true);
    expect(isValidKosyncField("")).toBe(false);
  });
});

describe("pickNewerProgress", () => {
  test("prefers higher timestamp, then higher percentage", () => {
    const older = {
      percentage: 0.9,
      progress: "90",
      device: "a",
      device_id: "1",
      timestamp: 100,
    };
    const newer = {
      percentage: 0.2,
      progress: "20",
      device: "b",
      device_id: "2",
      timestamp: 200,
    };
    expect(pickNewerProgress(older, newer)).toEqual(newer);
    expect(pickNewerProgress(newer, older)).toEqual(newer);

    const tiedA = { ...older, timestamp: 50, percentage: 0.4 };
    const tiedB = { ...older, timestamp: 50, percentage: 0.6 };
    expect(pickNewerProgress(tiedA, tiedB)).toEqual(tiedB);
    expect(pickNewerProgress(null, older)).toEqual(older);
    expect(pickNewerProgress(older, null)).toEqual(older);
    expect(pickNewerProgress(null, null)).toBeNull();
  });
});

describe("shouldAcceptKosyncProgressUpdate", () => {
  const incoming = {
    percentage: 0.4,
    progress: "40",
    device: "KOReader",
    device_id: "device-1",
    timestamp: 200,
  };

  test("rejects a delayed lower PUT after Books advanced", () => {
    expect(
      shouldAcceptKosyncProgressUpdate(
        { cfi: "epubcfi(/6/4)", percentage: 0.8, updatedAt: 150_000 },
        100,
        incoming
      )
    ).toBe(false);
  });

  test("accepts equal or forward progress after Books changed", () => {
    const existing = {
      cfi: "epubcfi(/6/4)",
      percentage: 0.8,
      updatedAt: 150_000,
    };
    expect(
      shouldAcceptKosyncProgressUpdate(existing, 100, {
        ...incoming,
        percentage: 0.8,
      })
    ).toBe(true);
    expect(
      shouldAcceptKosyncProgressUpdate(existing, 100, {
        ...incoming,
        percentage: 0.9,
      })
    ).toBe(true);
  });

  test("accepts a backward PUT when Books has not changed since KOSync", () => {
    expect(
      shouldAcceptKosyncProgressUpdate(
        { cfi: "", percentage: 0.8, updatedAt: 100_000 },
        100,
        incoming
      )
    ).toBe(true);
  });
});
