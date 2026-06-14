import type { ReactNode } from "react";
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
  MenubarRadioGroup,
  MenubarRadioItem,
} from "@/components/ui/menubar";
import { cn } from "@/lib/utils";
import {
  MENUBAR_ITEM_CLASS,
  MENUBAR_SEPARATOR_CLASS,
  MENUBAR_TRIGGER_CLASS,
} from "./menubarStyles";

export interface MenuRadioOptionDescriptor {
  label: ReactNode;
  value: string;
  disabled?: boolean;
  /** Extra classes merged onto the shared item class. */
  className?: string;
}

export type MenuItemDescriptor =
  | {
      type: "action";
      label: ReactNode;
      onClick: () => void;
      disabled?: boolean;
      shortcut?: string;
      /** Extra classes merged onto the shared item class. */
      className?: string;
    }
  | { type: "separator" }
  | {
      type: "checkbox";
      label: ReactNode;
      checked: boolean;
      onChange: (checked: boolean) => void;
      disabled?: boolean;
      /** Extra classes merged onto the shared item class. */
      className?: string;
    }
  | {
      type: "radioGroup";
      value: string;
      onValueChange: (value: string) => void;
      options: MenuRadioOptionDescriptor[];
    }
  | {
      type: "submenu";
      label: ReactNode;
      items: MenuItemDescriptor[];
      disabled?: boolean;
    };

export type MenuDescriptor = {
  label: ReactNode;
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
            className={cn(MENUBAR_ITEM_CLASS, item.className)}
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
            className={cn(MENUBAR_ITEM_CLASS, item.className)}
          >
            {item.label}
          </MenubarCheckboxItem>
        );
      case "radioGroup":
        return (
          <MenubarRadioGroup
            key={index}
            value={item.value}
            onValueChange={item.onValueChange}
          >
            {item.options.map((option) => (
              <MenubarRadioItem
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className={cn(MENUBAR_ITEM_CLASS, option.className)}
              >
                {option.label}
              </MenubarRadioItem>
            ))}
          </MenubarRadioGroup>
        );
      case "submenu":
        return (
          <MenubarSub key={index}>
            <MenubarSubTrigger
              disabled={item.disabled}
              className={MENUBAR_ITEM_CLASS}
            >
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
 * Declarative renderer for app menubars. Each descriptor becomes a Base UI
 * MenubarMenu styled with the shared `menubarStyles` constants so all OS
 * themes render identically to the hand-written JSX it replaces.
 *
 * Supports actions (with shortcuts), separators, checkboxes, radio groups,
 * and nested submenus; labels accept ReactNode and items accept extra
 * classes. Menus with truly bespoke content (embedded components, custom
 * triggers) should keep hand-written JSX.
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
