/**
 * App launch, HTML generation, and Infinite Mac control schemas
 */

import { z } from "zod";
import { appIds } from "../../../../src/config/appIds.js";
import { normalizeOptionalString } from "./media.js";

/**
 * Year validation for Internet Explorer time travel
 */
const yearRefinement = (year: string | undefined) => {
  if (year === undefined) return true;

  const allowedYearsRegex =
    /^(current|1000 BC|1 CE|500|800|1000|1200|1400|1600|1700|1800|19[0-8][0-9]|199[0-5]|199[1-9]|20[0-2][0-9]|2030|2040|2050|2060|2070|2080|2090|2100|2150|2200|2250|2300|2400|2500|2750|3000)$/;

  const currentYearNum = new Date().getFullYear();
  if (/^\d{4}$/.test(year)) {
    const numericYear = parseInt(year, 10);
    if (numericYear >= 1991 && numericYear < currentYearNum) {
      return true;
    }
  }

  return allowedYearsRegex.test(year);
};

/**
 * Launch app schema
 */
export const launchAppSchema = z
  .object({
    id: z.enum(appIds).describe("The app id to launch"),
    url: z
      .preprocess(normalizeOptionalString, z.string().optional())
      .describe(
        "For internet-explorer only: The URL to load in Internet Explorer. Omit https:// and www. from the URL."
      ),
    year: z
      .preprocess(normalizeOptionalString, z.string().optional())
      .describe(
        "For internet-explorer only: The year for the Wayback Machine or AI generation."
      )
      .refine(yearRefinement, {
        message: "Invalid year format or value.",
      }),
  })
  .refine(
    (data) => {
      if (data.id === "internet-explorer") {
        const urlProvided = data.url !== undefined && data.url !== null && data.url !== "";
        const yearProvided = data.year !== undefined && data.year !== null && data.year !== "";
        return (urlProvided && yearProvided) || (!urlProvided && !yearProvided);
      }
      if (data.url !== undefined || data.year !== undefined) {
        return false;
      }
      return true;
    },
    {
      message:
        "For 'internet-explorer', provide both 'url' and 'year', or neither. For other apps, do not provide 'url' or 'year'.",
    }
  );

/**
 * Close app schema
 */
export const closeAppSchema = z.object({
  id: z.enum(appIds).describe("The app id to close"),
});

/**
 * Generate HTML schema
 */
export const generateHtmlSchema = z.object({
  html: z
    .string()
    .describe(
      "The HTML code to render. It should follow the guidelines in CODE_GENERATION_INSTRUCTIONS—omit <head>/<body> tags and include only the body contents."
    ),
  title: z
    .string()
    .optional()
    .describe(
      "A short, descriptive title for this HTML applet (e.g., 'Calculator', 'Todo List', 'Color Picker'). This will be used as the default filename when the user saves the applet. Omit file extensions."
    ),
  icon: z
    .string()
    .optional()
    .describe(
      "A single emoji character to use as the applet icon (e.g., '🧮', '📝', '🎨'). This emoji will be displayed in the Finder and as the app icon."
    ),
});

/**
 * Aquarium schema (no input required)
 */
export const aquariumSchema = z.object({});

/**
 * Infinite Mac control schema
 * Controls the Infinite Mac emulator via postMessage API
 */
export const infiniteMacControlSchema = z
  .object({
    action: z
      .enum([
        "launchSystem",
        "getStatus",
        "readScreen",
        "mouseMove",
        "mouseClick",
        "doubleClick",
        "keyPress",
        "pause",
        "unpause",
      ])
      .describe(
        "Action to perform: 'launchSystem' launches a Mac OS system, 'getStatus' returns emulator state, " +
          "'readScreen' captures the current screen as an image, 'mouseMove' moves the mouse cursor, " +
          "'mouseClick' single-clicks at a position, 'doubleClick' double-clicks at a position (for opening files/folders), " +
          "'keyPress' sends a key press, 'pause'/'unpause' controls emulation."
      ),
    system: z
      .enum([
        "system-1",
        "system-6",
        "system-7-5",
        "kanjitalk-7-5",
        "macos-8",
        "macos-8-5",
        "macos-9",
        "macos-9-2",
        "macosx-10-1",
        "macosx-10-2",
        "macosx-10-3",
        "macosx-10-4",
      ])
      .optional()
      .describe(
        "For 'launchSystem': The Mac OS system to launch. Options: " +
          "'system-1' (System 1.0, 1984), 'system-6' (System 6.0.8, 1991), " +
          "'system-7-5' (System 7.5.3, 1996), 'kanjitalk-7-5' (Japanese System 7.5.3), " +
          "'macos-8' (Mac OS 8.0, 1997), 'macos-8-5' (Mac OS 8.5, 1998), " +
          "'macos-9' (Mac OS 9.0, 1999), 'macos-9-2' (Mac OS 9.2.2, 2001), " +
          "'macosx-10-1' (Mac OS X 10.1, 2001), 'macosx-10-2' (Mac OS X 10.2, 2002), " +
          "'macosx-10-3' (Mac OS X 10.3, 2003), 'macosx-10-4' (Mac OS X 10.4, 2005)."
      ),
    x: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("For 'mouseMove' and 'mouseClick': X coordinate in screen pixels."),
    y: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("For 'mouseMove' and 'mouseClick': Y coordinate in screen pixels."),
    button: z
      .enum(["left", "right"])
      .optional()
      .default("left")
      .describe("For 'mouseClick': Which mouse button to click. Defaults to 'left'."),
    key: z
      .string()
      .optional()
      .describe(
        "For 'keyPress': The key to press. Use JavaScript key codes like 'KeyA', 'KeyB', 'Enter', 'Space', " +
          "'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Tab', 'Escape', etc."
      ),
  })
  .superRefine((data, ctx) => {
    if (data.action === "launchSystem" && !data.system) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The 'launchSystem' action requires the 'system' parameter.",
        path: ["system"],
      });
    }
    if (
      (data.action === "mouseMove" || data.action === "mouseClick" || data.action === "doubleClick") &&
      (data.x === undefined || data.y === undefined)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `The '${data.action}' action requires both 'x' and 'y' parameters.`,
        path: ["x"],
      });
    }
    if (data.action === "keyPress" && !data.key) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The 'keyPress' action requires the 'key' parameter.",
        path: ["key"],
      });
    }
  });
