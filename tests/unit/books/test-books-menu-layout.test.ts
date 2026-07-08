import { describe, expect, test } from "bun:test";
import type {
  MenuDescriptor,
  MenuItemDescriptor,
} from "../../../src/components/shared/menubar/AppMenuBarMenus";
import {
  buildBooksMenuLayout,
  flattenBooksMenuSubmenus,
} from "../../../src/apps/books/utils/booksMenuLayout";

const noop = () => {};

describe("Books compact menu layout", () => {
  test("flattens and scrolls only the Go menu", () => {
    const fileMenu: MenuDescriptor = {
      label: "File",
      items: [{ type: "action", label: "Close", onClick: noop }],
    };
    const viewMenu: MenuDescriptor = {
      label: "View",
      items: [
        {
          type: "submenu",
          label: "Font",
          items: [{ type: "action", label: "Serif", onClick: noop }],
        },
      ],
    };
    const speechMenu: MenuDescriptor = {
      label: "Speech",
      items: [
        { type: "action", label: "Start Speaking", onClick: noop },
        { type: "action", label: "Stop Speaking", onClick: noop },
        { type: "separator" },
        {
          type: "submenu",
          label: "Speech Rate",
          items: [
            {
              type: "radioGroup",
              value: "1",
              onValueChange: noop,
              options: [{ label: "Normal", value: "1" }],
            },
          ],
        },
      ],
    };
    const goMenu: MenuDescriptor = {
      label: "Go",
      items: [
        { type: "action", label: "Next Page", onClick: noop },
        { type: "separator" },
        {
          type: "submenu",
          label: "Chapters",
          items: [
            {
              type: "radioGroup",
              value: "0",
              onValueChange: noop,
              options: [{ label: "Chapter 1", value: "0" }],
            },
          ],
        },
      ],
    };

    const compactMenus = buildBooksMenuLayout({
      fileMenu,
      viewMenu,
      speechMenu,
      goMenu,
      isCompact: true,
    });
    const desktopMenus = buildBooksMenuLayout({
      fileMenu,
      viewMenu,
      speechMenu,
      goMenu,
      isCompact: false,
    });

    expect(compactMenus[0]).toBe(fileMenu);
    expect(compactMenus[1]).toBe(viewMenu);
    expect(compactMenus[1].items[0].type).toBe("submenu");
    expect(compactMenus[2]).not.toBe(speechMenu);
    expect(compactMenus[2].items.map((item) => item.type)).toEqual([
      "action",
      "action",
      "separator",
      "radioGroup",
    ]);
    expect(
      compactMenus[2].items.some((item) => item.type === "submenu")
    ).toBe(false);
    expect(compactMenus[3]).not.toBe(goMenu);
    expect(compactMenus[3].items.map((item) => item.type)).toEqual([
      "action",
      "separator",
      "radioGroup",
    ]);
    expect(
      compactMenus[3].items.some((item) => item.type === "submenu")
    ).toBe(false);
    expect(compactMenus[3].contentClassName).toContain("overflow-y-auto");
    expect(desktopMenus[2]).toBe(speechMenu);
    expect(desktopMenus[3]).toBe(goMenu);
  });

  test("flattens multiple flyouts without their headers", () => {
    const items: MenuItemDescriptor[] = [
      {
        type: "submenu",
        label: "Part",
        items: [
          {
            type: "radioGroup",
            value: "1",
            onValueChange: noop,
            options: [
              { label: "Part 1", value: "1" },
              { label: "Part 2", value: "2" },
            ],
          },
        ],
      },
      {
        type: "submenu",
        label: "Appendix",
        items: [
          {
            type: "action",
            label: "Notes",
            onClick: noop,
          },
        ],
      },
    ];

    const flattened = flattenBooksMenuSubmenus(items);

    expect(flattened.map((item) => item.type)).toEqual([
      "radioGroup",
      "separator",
      "action",
    ]);
    expect(flattened.some((item) => item.type === "submenu")).toBe(false);
  });

  test("does not duplicate an existing separator before a section", () => {
    const flattened = flattenBooksMenuSubmenus([
      { type: "action", label: "Next Page", onClick: noop },
      { type: "separator" },
      {
        type: "submenu",
        label: "Chapters",
        items: [{ type: "action", label: "Chapter 1", onClick: noop }],
      },
    ]);

    expect(flattened.map((item) => item.type)).toEqual([
      "action",
      "separator",
      "action",
    ]);
  });

  test("keeps every item in a disabled submenu disabled", () => {
    const items: MenuItemDescriptor[] = [
      {
        type: "submenu",
        label: "Chapters",
        disabled: true,
        items: [
          {
            type: "radioGroup",
            value: "",
            onValueChange: noop,
            options: [{ label: "Chapter 1", value: "0" }],
          },
          {
            type: "checkbox",
            label: "Bookmark",
            checked: false,
            onChange: noop,
          },
        ],
      },
    ];

    const flattened = flattenBooksMenuSubmenus(items);
    const radioGroup = flattened.find((item) => item.type === "radioGroup");
    const checkbox = flattened.find((item) => item.type === "checkbox");

    expect(radioGroup?.options.every((option) => option.disabled)).toBe(true);
    expect(checkbox?.disabled).toBe(true);

    const originalRadioGroup = items[0].type === "submenu" && items[0].items[0];
    expect(
      originalRadioGroup &&
        originalRadioGroup.type === "radioGroup" &&
        originalRadioGroup.options[0].disabled
    ).toBeUndefined();
  });
});
