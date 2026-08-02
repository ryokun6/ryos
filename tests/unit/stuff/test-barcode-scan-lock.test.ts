#!/usr/bin/env bun
import { describe, expect, test } from "bun:test";
import { createBarcodeScanLock } from "../../../src/apps/stuff/utils/barcodeScanLock";
import { mapNativeBarcodeFormat } from "../../../src/apps/stuff/utils/barcodeDetectorSupport";

describe("createBarcodeScanLock", () => {
  test("accepts a code once then rejects until unlock + cooldown", () => {
    let now = 1_000;
    const lock = createBarcodeScanLock({
      cooldownMs: 500,
      now: () => now,
    });

    expect(lock.tryAccept("9780140329473")).toBe(true);
    expect(lock.tryAccept("9780140329473")).toBe(false);
    expect(lock.tryAccept("012345678905")).toBe(false);

    lock.unlock();
    // Same code still inside cooldown
    expect(lock.tryAccept("9780140329473")).toBe(false);

    now += 501;
    expect(lock.tryAccept("9780140329473")).toBe(true);
  });

  test("after cooldown, a different code can be accepted once unlocked", () => {
    let now = 0;
    const lock = createBarcodeScanLock({
      cooldownMs: 200,
      now: () => now,
    });

    expect(lock.tryAccept("AAA")).toBe(true);
    lock.unlock();
    now += 250;
    expect(lock.tryAccept("BBB")).toBe(true);
  });

  test("reset clears lock and cooldown memory", () => {
    const lock = createBarcodeScanLock({ cooldownMs: 10_000 });
    expect(lock.tryAccept("X")).toBe(true);
    lock.reset();
    expect(lock.tryAccept("X")).toBe(true);
  });

  test("rejects blank codes", () => {
    const lock = createBarcodeScanLock();
    expect(lock.tryAccept("   ")).toBe(false);
    expect(lock.tryAccept("")).toBe(false);
  });
});

describe("mapNativeBarcodeFormat", () => {
  test("maps BarcodeDetector ids to Stuff/ZXing names", () => {
    expect(mapNativeBarcodeFormat("ean_13")).toBe("EAN_13");
    expect(mapNativeBarcodeFormat("upc-a")).toBe("UPC_A");
    expect(mapNativeBarcodeFormat("qr_code")).toBe("QR_CODE");
    expect(mapNativeBarcodeFormat("isbn_13")).toBe("EAN_13");
  });
});
