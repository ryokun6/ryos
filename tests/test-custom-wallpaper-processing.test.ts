import { describe, expect, test } from "bun:test";
import {
  CUSTOM_WALLPAPER_JPEG_QUALITY,
  CUSTOM_WALLPAPER_MIME_TYPE,
  CUSTOM_WALLPAPER_RESIZE_HEIGHT_THRESHOLD,
  CUSTOM_WALLPAPER_TARGET_HEIGHT,
  buildCustomWallpaperFilename,
  convertImageFileToWallpaperJpeg,
  getCustomWallpaperOutputSize,
} from "../src/utils/customWallpaperProcessing";

describe("custom wallpaper processing", () => {
  test("normalizes generated filenames to jpg", () => {
    expect(buildCustomWallpaperFilename("Beach Sunset!!.png")).toBe(
      "Beach_Sunset.jpg"
    );
    expect(buildCustomWallpaperFilename(".png")).toBe("custom_wallpaper.jpg");
  });

  test("keeps original dimensions for images smaller than 1400p", () => {
    expect(getCustomWallpaperOutputSize(1366, 768)).toEqual({
      width: 1366,
      height: 768,
      shouldResize: false,
    });
  });

  test("resizes images at or above 1400p while preserving aspect ratio", () => {
    expect(
      getCustomWallpaperOutputSize(2560, CUSTOM_WALLPAPER_RESIZE_HEIGHT_THRESHOLD)
    ).toEqual({
      width: 2560,
      height: CUSTOM_WALLPAPER_TARGET_HEIGHT,
      shouldResize: true,
    });
  });

  test("converts smaller uploads to jpg without resizing", async () => {
    const calls = {
      canvasWidth: 0,
      canvasHeight: 0,
      drawImage: [] as Array<[unknown, number, number, number, number]>,
      toBlobType: "",
      toBlobQuality: 0,
      cleanedUp: false,
    };

    const converted = await convertImageFileToWallpaperJpeg(
      new File(["png"], "Desktop Shot.png", {
        type: "image/png",
        lastModified: 456,
      }),
      {
        loadImage: async () => ({
          source: { id: "small-image" },
          width: 1366,
          height: 768,
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
              fillRect: () => {},
              drawImage: (source, dx, dy, dWidth, dHeight) => {
                calls.drawImage.push([source, dx, dy, dWidth, dHeight]);
              },
            },
          };
        },
      }
    );

    expect(converted.name).toBe("Desktop_Shot.jpg");
    expect(converted.type).toBe(CUSTOM_WALLPAPER_MIME_TYPE);
    expect(converted.lastModified).toBe(456);
    expect(calls.canvasWidth).toBe(1366);
    expect(calls.canvasHeight).toBe(768);
    expect(calls.drawImage).toEqual([[{ id: "small-image" }, 0, 0, 1366, 768]]);
    expect(calls.toBlobType).toBe(CUSTOM_WALLPAPER_MIME_TYPE);
    expect(calls.toBlobQuality).toBe(CUSTOM_WALLPAPER_JPEG_QUALITY);
    expect(calls.cleanedUp).toBe(true);
  });

  test("converts larger uploads to 1400p jpeg with preserved aspect ratio", async () => {
    const calls = {
      canvasWidth: 0,
      canvasHeight: 0,
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
              fillRect: () => {},
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
    expect(calls.canvasWidth).toBe(1867);
    expect(calls.canvasHeight).toBe(CUSTOM_WALLPAPER_TARGET_HEIGHT);
    expect(calls.drawImage).toEqual([[{ id: "decoded-image" }, 0, 0, 1867, 1400]]);
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
