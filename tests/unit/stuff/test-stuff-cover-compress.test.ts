import { describe, expect, test } from "bun:test";

import { STUFF_IMAGE_MAX_BYTES } from "../../../src/apps/stuff/utils/barcodeLookup";
import {
  STUFF_COVER_EDGE_STEPS,
  STUFF_COVER_JPEG_QUALITIES,
  STUFF_COVER_MAX_EDGE,
  STUFF_COVER_MIME_TYPE,
  getStuffCoverOutputSize,
  prepareStuffCoverBlob,
} from "../../../src/apps/stuff/utils/stuffCoverCompress";

describe("getStuffCoverOutputSize", () => {
  test("keeps dimensions within max edge", () => {
    expect(getStuffCoverOutputSize(1200, 800)).toEqual({
      width: 1200,
      height: 800,
      shouldResize: false,
    });
  });

  test("scales down longest edge while preserving aspect ratio", () => {
    expect(getStuffCoverOutputSize(3200, 2000, STUFF_COVER_MAX_EDGE)).toEqual({
      width: 1600,
      height: 1000,
      shouldResize: true,
    });
    expect(getStuffCoverOutputSize(2000, 3200, 1200)).toEqual({
      width: 750,
      height: 1200,
      shouldResize: true,
    });
  });
});

describe("prepareStuffCoverBlob", () => {
  test("returns original blob when already under the size limit", async () => {
    const small = new Blob([new Uint8Array(128)], { type: "image/png" });
    const prepared = await prepareStuffCoverBlob(small);
    expect(prepared).toBe(small);
  });

  test("resizes and JPEG-encodes oversized blobs until under budget", async () => {
    const calls = {
      canvasWidth: 0,
      canvasHeight: 0,
      qualities: [] as number[],
      cleanedUp: false,
    };

    const oversized = new Blob(
      [new Uint8Array(STUFF_IMAGE_MAX_BYTES + 1024)],
      { type: "image/png" }
    );

    let encodeCount = 0;
    const prepared = await prepareStuffCoverBlob(oversized, {
      loadImage: async () => ({
        source: { id: "cover" },
        width: 3200,
        height: 2000,
        cleanup: () => {
          calls.cleanedUp = true;
        },
      }),
      createCanvas: (width, height) => {
        calls.canvasWidth = width;
        calls.canvasHeight = height;
        return {
          canvas: {
            toBlob: (callback, type, quality) => {
              encodeCount += 1;
              calls.qualities.push(quality ?? 0);
              // First quality too large; second fits.
              const size =
                encodeCount === 1
                  ? STUFF_IMAGE_MAX_BYTES + 10
                  : Math.floor(STUFF_IMAGE_MAX_BYTES / 2);
              callback(
                new Blob([new Uint8Array(size)], {
                  type: type ?? STUFF_COVER_MIME_TYPE,
                })
              );
            },
          },
          context: {
            imageSmoothingEnabled: true,
            imageSmoothingQuality: "high",
            drawImage: () => {},
          },
        };
      },
    });

    expect(prepared.type).toBe(STUFF_COVER_MIME_TYPE);
    expect(prepared.size).toBeLessThanOrEqual(STUFF_IMAGE_MAX_BYTES);
    expect(calls.canvasWidth).toBe(1600);
    expect(calls.canvasHeight).toBe(1000);
    expect(calls.qualities[0]).toBe(STUFF_COVER_JPEG_QUALITIES[0]);
    expect(calls.qualities[1]).toBe(STUFF_COVER_JPEG_QUALITIES[1]);
    expect(calls.cleanedUp).toBe(true);
    expect(STUFF_COVER_EDGE_STEPS[0]).toBe(STUFF_COVER_MAX_EDGE);
  });

  test("throws when compression cannot meet the size budget", async () => {
    const oversized = new Blob(
      [new Uint8Array(STUFF_IMAGE_MAX_BYTES + 1)],
      { type: "image/jpeg" }
    );

    await expect(
      prepareStuffCoverBlob(oversized, {
        loadImage: async () => ({
          source: {},
          width: 4000,
          height: 4000,
        }),
        createCanvas: () => ({
          canvas: {
            toBlob: (callback, type) => {
              callback(
                new Blob([new Uint8Array(STUFF_IMAGE_MAX_BYTES + 1)], {
                  type: type ?? STUFF_COVER_MIME_TYPE,
                })
              );
            },
          },
          context: {
            imageSmoothingEnabled: true,
            imageSmoothingQuality: "high",
            drawImage: () => {},
          },
        }),
      })
    ).rejects.toThrow(/exceeds size limit/i);
  });
});
