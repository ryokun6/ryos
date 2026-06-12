import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarCheckboxItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
} from "@/components/ui/menubar";
import {
  MENUBAR_ITEM_CLASS,
  MENUBAR_SEPARATOR_CLASS,
  MENUBAR_TRIGGER_CLASS,
} from "./menubarStyles";

export type MenuItemDescriptor =
  | {
      type: "action";
      label: string;
      onClick: () => void;
      disabled?: boolean;
      shortcut?: string;
    }
  | { type: "separator" }
  | {
      type: "checkbox";
      label: string;
      checked: boolean;
      onChange: (checked: boolean) => void;
      disabled?: boolean;
    }
  | { type: "submenu"; label: string; items: MenuItemDescriptor[] };

export type MenuDescriptor = {
  label: string;
  items: MenuItemDescriptor[];
};

function renderItems(items: MenuItemDescriptor[]) {
  return items.map((item, index) => {
    switch (item.type) {
      case "separator":
        return (
          <MenubarSeparator key={index} className={MENUBAR_SEPARATOR_CLASS} />
        );
      case "action":
        return (
          <MenubarItem
            key={index}
            onClick={item.onClick}
            disabled={item.disabled}
            className={MENUBAR_ITEM_CLASS}
          >
            {item.label}
            {item.shortcut && (
              <MenubarShortcut>{item.shortcut}</MenubarShortcut>
            )}
          </MenubarItem>
        );
      case "checkbox":
        return (
          <MenubarCheckboxItem
            key={index}
            checked={item.checked}
            onCheckedChange={item.onChange}
            disabled={item.disabled}
            className={MENUBAR_ITEM_CLASS}
          >
            {item.label}
          </MenubarCheckboxItem>
        );
      case "submenu":
        return (
          <MenubarSub key={index}>
            <MenubarSubTrigger className={MENUBAR_ITEM_CLASS}>
              {item.label}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0">
              {renderItems(item.items)}
            </MenubarSubContent>
          </MenubarSub>
        );
    }
  });
}

/**
 * Declarative renderer for simple app menubars. Each descriptor becomes a
 * Radix MenubarMenu styled with the shared `menubarStyles` constants so all
 * OS themes render identically to the hand-written JSX it replaces.
 *
 * Intended for small, mechanical menus (plain actions, separators,
 * checkboxes, basic submenus). Menus that need radio groups, custom
 * classNames, or bespoke item content should keep hand-written JSX.
 */
export function AppMenuBarMenus({ menus }: { menus: MenuDescriptor[] }) {
  return (
    <>
      {menus.map((menu, index) => (
        <MenubarMenu key={index}>
          <MenubarTrigger className={MENUBAR_TRIGGER_CLASS}>
            {menu.label}
          </MenubarTrigger>
          <MenubarContent align="start" sideOffset={1} className="px-0">
            {renderItems(menu.items)}
          </MenubarContent>
        </MenubarMenu>
      ))}
    </>
  );
}
