import { describe, expect, test } from "bun:test";
import {
  CUSTOM_WALLPAPER_JPEG_QUALITY,
  CUSTOM_WALLPAPER_MIME_TYPE,
  CUSTOM_WALLPAPER_TARGET_HEIGHT,
  CUSTOM_WALLPAPER_TARGET_WIDTH,
  buildCustomWallpaperFilename,
  calculateWallpaperCoverPlacement,
  convertImageFileToWallpaperJpeg,
} from "../src/utils/customWallpaperProcessing";

describe("custom wallpaper processing", () => {
  test("calculates centered cover placement for matching aspect ratios", () => {
    const placement = calculateWallpaperCoverPlacement(3840, 2160);

    expect(placement.offsetX).toBe(0);
    expect(placement.offsetY).toBe(0);
    expect(placement.drawWidth).toBe(CUSTOM_WALLPAPER_TARGET_WIDTH);
    expect(placement.drawHeight).toBe(CUSTOM_WALLPAPER_TARGET_HEIGHT);
  });

  test("calculates centered cover placement for portrait images", () => {
    const placement = calculateWallpaperCoverPlacement(1080, 1920);

    expect(placement.offsetX).toBe(0);
    expect(placement.offsetY).toBeCloseTo(-1166.6667, 3);
    expect(placement.drawWidth).toBe(CUSTOM_WALLPAPER_TARGET_WIDTH);
    expect(placement.drawHeight).toBeCloseTo(3413.3333, 3);
  });

  test("normalizes generated filenames to jpg", () => {
    expect(buildCustomWallpaperFilename("Beach Sunset!!.png")).toBe(
      "Beach_Sunset.jpg"
    );
    expect(buildCustomWallpaperFilename(".png")).toBe("custom_wallpaper.jpg");
  });

  test("converts uploaded images to 1080p jpeg", async () => {
    const calls = {
      canvasWidth: 0,
      canvasHeight: 0,
      fillStyle: "",
      fillRect: [] as Array<[number, number, number, number]>,
      drawImage: [] as Array<[unknown, number, number, number, number]>,
      toBlobType: "",
      toBlobQuality: 0,
      cleanedUp: false,
    };

    const converted = await convertImageFileToWallpaperJpeg(
      new File(["png"], "Beach Sunset.png", {
        type: "image/png",
        lastModified: 123,
      }),
      {
        loadImage: async () => ({
          source: { id: "decoded-image" },
          width: 4000,
          height: 3000,
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
                calls.toBlobType = type ?? "";
                calls.toBlobQuality = quality ?? 0;
                callback(new Blob(["jpg"], { type: CUSTOM_WALLPAPER_MIME_TYPE }));
              },
            },
            context: {
              fillStyle: "",
              fillRect: (x, y, w, h) => {
                calls.fillRect.push([x, y, w, h]);
              },
              drawImage: (source, dx, dy, dWidth, dHeight) => {
                calls.drawImage.push([source, dx, dy, dWidth, dHeight]);
              },
            },
          };
        },
      }
    );

    expect(converted.name).toBe("Beach_Sunset.jpg");
    expect(converted.type).toBe(CUSTOM_WALLPAPER_MIME_TYPE);
    expect(converted.lastModified).toBe(123);
    expect(calls.canvasWidth).toBe(CUSTOM_WALLPAPER_TARGET_WIDTH);
    expect(calls.canvasHeight).toBe(CUSTOM_WALLPAPER_TARGET_HEIGHT);
    expect(calls.fillRect).toEqual([[0, 0, 1920, 1080]]);
    expect(calls.drawImage).toHaveLength(1);
    expect(calls.drawImage[0]?.[0]).toEqual({ id: "decoded-image" });
    expect(calls.drawImage[0]?.[1]).toBe(0);
    expect(calls.drawImage[0]?.[2]).toBeCloseTo(-180, 5);
    expect(calls.drawImage[0]?.[3]).toBe(1920);
    expect(calls.drawImage[0]?.[4]).toBe(1440);
    expect(calls.toBlobType).toBe(CUSTOM_WALLPAPER_MIME_TYPE);
    expect(calls.toBlobQuality).toBe(CUSTOM_WALLPAPER_JPEG_QUALITY);
    expect(calls.cleanedUp).toBe(true);
  });

  test("rejects non-image files", async () => {
    await expect(
      convertImageFileToWallpaperJpeg(
        new File(["text"], "notes.txt", { type: "text/plain" })
      )
    ).rejects.toThrow("Only image files allowed");
  });
});
