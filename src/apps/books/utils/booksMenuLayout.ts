import type { MenuItemDescriptor } from "@/components/shared/menubar/AppMenuBarMenus";

function disableMenuItem(item: MenuItemDescriptor): MenuItemDescriptor {
  switch (item.type) {
    case "separator":
      return item;
    case "radioGroup":
      return {
        ...item,
        options: item.options.map((option) => ({
          ...option,
          disabled: true,
        })),
      };
    case "submenu":
      return {
        ...item,
        disabled: true,
        items: item.items.map(disableMenuItem),
      };
    case "action":
    case "checkbox":
    case "label":
      return { ...item, disabled: true };
  }
}

function appendWithoutDuplicateSeparators(
  result: MenuItemDescriptor[],
  item: MenuItemDescriptor
) {
  if (
    item.type === "separator" &&
    (result.length === 0 || result.at(-1)?.type === "separator")
  ) {
    return;
  }
  result.push(item);
}

/**
 * Turn flyout submenus into labeled sections for compact viewports.
 * Disabled submenu state is copied to every child so flattening never enables
 * an action that the nested desktop menu would block.
 */
export function flattenBooksMenuSubmenus(
  items: MenuItemDescriptor[]
): MenuItemDescriptor[] {
  const result: MenuItemDescriptor[] = [];

  for (const item of items) {
    if (item.type !== "submenu") {
      appendWithoutDuplicateSeparators(result, item);
      continue;
    }

    appendWithoutDuplicateSeparators(result, { type: "separator" });
    appendWithoutDuplicateSeparators(result, {
      type: "label",
      label: item.label,
      disabled: item.disabled,
    });

    const children = flattenBooksMenuSubmenus(item.items);
    for (const child of children) {
      appendWithoutDuplicateSeparators(
        result,
        item.disabled ? disableMenuItem(child) : child
      );
    }
  }

  while (result.at(-1)?.type === "separator") {
    result.pop();
  }

  return result;
}
