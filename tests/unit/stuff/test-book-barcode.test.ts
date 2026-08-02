#!/usr/bin/env bun
import { describe, expect, test } from "bun:test";
import {
  isBookLookupScan,
  isIsbnBarcode,
  tagIdsWithDefaultBooks,
} from "../../../src/apps/stuff/utils/bookBarcode";

describe("isIsbnBarcode", () => {
  test("accepts ISBN-13 / bookland EAN (978/979)", () => {
    expect(isIsbnBarcode("9780743273565")).toBe(true);
    expect(isIsbnBarcode("9791234567896")).toBe(true);
    expect(isIsbnBarcode("978-0-7432-7356-5")).toBe(true);
  });

  test("accepts ISBN-10 including X check digit", () => {
    expect(isIsbnBarcode("0306406152")).toBe(true);
    expect(isIsbnBarcode("0-306-40615-2")).toBe(true);
    expect(isIsbnBarcode("043942089X")).toBe(true);
  });

  test("rejects UPC and other product codes", () => {
    expect(isIsbnBarcode("012345678905")).toBe(false);
    expect(isIsbnBarcode("027242919216")).toBe(false);
    expect(isIsbnBarcode("12345670")).toBe(false);
    expect(isIsbnBarcode("Harry Potter")).toBe(false);
  });
});

describe("isBookLookupScan", () => {
  test("true when queryKind is isbn", () => {
    expect(
      isBookLookupScan({ queryKind: "isbn", barcode: "012345678905" })
    ).toBe(true);
  });

  test("true for ISBN barcode formats", () => {
    expect(
      isBookLookupScan({ barcode: "x", barcodeFormat: "ISBN_13" })
    ).toBe(true);
    expect(
      isBookLookupScan({ barcode: "x", barcodeFormat: "isbn-10" })
    ).toBe(true);
  });

  test("true when scanned/typed code is ISBN-shaped (manual CODE_128 entry)", () => {
    expect(
      isBookLookupScan({
        barcode: "9780743273565",
        barcodeFormat: "CODE_128",
      })
    ).toBe(true);
  });

  test("false for UPC barcode scans even if format is EAN_13", () => {
    expect(
      isBookLookupScan({
        barcode: "012345678905",
        barcodeFormat: "EAN_13",
        queryKind: "barcode",
      })
    ).toBe(false);
  });
});

describe("tagIdsWithDefaultBooks", () => {
  test("adds Books for book scans; leaves non-book unchanged", () => {
    expect(tagIdsWithDefaultBooks(undefined, "tag-books", true)).toEqual([
      "tag-books",
    ]);
    expect(tagIdsWithDefaultBooks(undefined, "tag-books", false)).toBeUndefined();
    expect(
      tagIdsWithDefaultBooks(["tag-kitchen"], "tag-books", false)
    ).toEqual(["tag-kitchen"]);
  });

  test("merges Books without stripping other tags or duplicating", () => {
    expect(
      tagIdsWithDefaultBooks(["tag-a"], "tag-books", true)
    ).toEqual(["tag-a", "tag-books"]);
    expect(
      tagIdsWithDefaultBooks(["tag-books", "tag-a"], "tag-books", true)
    ).toEqual(["tag-books", "tag-a"]);
  });
});
