import type {
  MenuDescriptor,
  MenuItemDescriptor,
} from "@/components/shared/menubar/AppMenuBarMenus";

const COMPACT_GO_MENU_CLASS =
  "w-72 max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain touch-pan-y";

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

export function buildBooksMenuLayout({
  fileMenu,
  viewMenu,
  goMenu,
  isCompact,
}: {
  fileMenu: MenuDescriptor;
  viewMenu: MenuDescriptor;
  goMenu: MenuDescriptor;
  isCompact: boolean;
}): MenuDescriptor[] {
  return [
    fileMenu,
    viewMenu,
    isCompact
      ? {
          ...goMenu,
          items: flattenBooksMenuSubmenus(goMenu.items),
          contentClassName: COMPACT_GO_MENU_CLASS,
        }
      : goMenu,
  ];
}
