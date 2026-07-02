import { describe, expect, test } from "bun:test";
import type { MenuItemDescriptor } from "../src/components/shared/menubar/AppMenuBarMenus";
import { flattenBooksMenuSubmenus } from "../src/apps/books/utils/booksMenuLayout";

const noop = () => {};

describe("Books compact menu layout", () => {
  test("flattens flyouts into separated, labeled sections", () => {
    const items: MenuItemDescriptor[] = [
      {
        type: "submenu",
        label: "Font",
        items: [
          {
            type: "radioGroup",
            value: "serif",
            onValueChange: noop,
            options: [
              { label: "Serif", value: "serif" },
              { label: "Sans Serif", value: "sans" },
            ],
          },
        ],
      },
      {
        type: "submenu",
        label: "Text Size",
        items: [
          {
            type: "action",
            label: "Larger",
            onClick: noop,
          },
        ],
      },
    ];

    const flattened = flattenBooksMenuSubmenus(items);

    expect(flattened.map((item) => item.type)).toEqual([
      "label",
      "radioGroup",
      "separator",
      "label",
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
      "label",
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
    const label = flattened.find((item) => item.type === "label");
    const radioGroup = flattened.find((item) => item.type === "radioGroup");
    const checkbox = flattened.find((item) => item.type === "checkbox");

    expect(label?.disabled).toBe(true);
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
