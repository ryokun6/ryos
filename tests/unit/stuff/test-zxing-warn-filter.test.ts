#!/usr/bin/env bun
import { afterEach, describe, expect, test } from "bun:test";
import {
  installZxingMultiFormatReaderWarnFilter,
  isZxingMultiFormatReaderNoiseWarn,
  resetZxingMultiFormatReaderWarnFilterForTests,
} from "../../../src/apps/stuff/utils/zxingWarnFilter";

describe("isZxingMultiFormatReaderNoiseWarn", () => {
  test("matches the @zxing/library 0.23.0 spam prefix", () => {
    expect(
      isZxingMultiFormatReaderNoiseWarn(
        "MultiFormatReader: non-ReaderException from reader:"
      )
    ).toBe(true);
  });

  test("rejects unrelated warnings", () => {
    expect(isZxingMultiFormatReaderNoiseWarn("Something else")).toBe(false);
    expect(isZxingMultiFormatReaderNoiseWarn(undefined)).toBe(false);
    expect(isZxingMultiFormatReaderNoiseWarn(null)).toBe(false);
  });
});

describe("installZxingMultiFormatReaderWarnFilter", () => {
  const originalWarn = console.warn;
  const captured: unknown[][] = [];

  afterEach(() => {
    resetZxingMultiFormatReaderWarnFilterForTests();
    console.warn = originalWarn;
    captured.length = 0;
  });

  test("suppresses MultiFormatReader noise and restores on dispose", () => {
    console.warn = (...args: unknown[]) => {
      captured.push(args);
    };

    const dispose = installZxingMultiFormatReaderWarnFilter();
    console.warn("MultiFormatReader: non-ReaderException from reader:", {
      kind: "NotFoundException",
    });
    console.warn("keep this warning");
    expect(captured).toEqual([["keep this warning"]]);

    dispose();
    console.warn("MultiFormatReader: non-ReaderException from reader:");
    expect(captured).toEqual([
      ["keep this warning"],
      ["MultiFormatReader: non-ReaderException from reader:"],
    ]);
  });

  test("ref-counts nested installs", () => {
    console.warn = (...args: unknown[]) => {
      captured.push(args);
    };

    const disposeA = installZxingMultiFormatReaderWarnFilter();
    const disposeB = installZxingMultiFormatReaderWarnFilter();

    console.warn("MultiFormatReader: non-ReaderException from reader:");
    expect(captured).toEqual([]);

    disposeA();
    console.warn("MultiFormatReader: non-ReaderException from reader:");
    expect(captured).toEqual([]);

    disposeB();
    console.warn("MultiFormatReader: non-ReaderException from reader:");
    expect(captured).toEqual([
      ["MultiFormatReader: non-ReaderException from reader:"],
    ]);
  });

  test("dispose is idempotent", () => {
    console.warn = (...args: unknown[]) => {
      captured.push(args);
    };

    const dispose = installZxingMultiFormatReaderWarnFilter();
    dispose();
    dispose();
    console.warn("MultiFormatReader: non-ReaderException from reader:");
    expect(captured).toEqual([
      ["MultiFormatReader: non-ReaderException from reader:"],
    ]);
  });
});
