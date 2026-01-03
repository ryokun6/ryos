import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { ReactNode, useEffect } from "react";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { useSound, Sounds } from "@/hooks/useSound";

// ------------------ Types ------------------
export type MenuItem =
  | {
      type: "item";
      label: string;
      onSelect?: () => void;
      disabled?: boolean;
      icon?: string; // Icon path or emoji
    }
  | {
      type: "separator";
    }
  | {
      type: "submenu";
      label: string;
      items: MenuItem[];
      icon?: string; // Icon path or emoji
    }
  | {
      type: "checkbox";
      label: string;
      checked: boolean;
      onSelect?: () => void;
      disabled?: boolean;
    }
  | {
      type: "radioGroup";
      value: string;
      onChange: (val: string) => void;
      items: Array<{ label: string; value: string }>;
    };

interface RightClickMenuProps {
  position: { x: number; y: number } | null;
  onClose: () => void;
  items: MenuItem[];
  /** Optional alignment, defaults to "start" */
  align?: "start" | "center" | "end";
}

export const menuItemClass =
  "text-md h-6 px-3 active:bg-gray-900 active:text-white min-w-[140px] flex items-center gap-2";

// ------------------ Renderer helpers ------------------
function renderItems(items: MenuItem[]): ReactNode {
  return items.map((item, idx) => {
    switch (item.type) {
      case "item":
        return (
          <DropdownMenuItem
            key={idx}
            onSelect={item.onSelect}
            disabled={item.disabled}
            className={menuItemClass}
          >
            {item.icon && (
              <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                {item.icon.startsWith("/") || item.icon.startsWith("http") ? (
                  <ThemedIcon
                    name={item.icon}
                    alt={item.label}
                    className="w-4 h-4 [image-rendering:pixelated]"
                  />
                ) : (
                  <span className="text-xs leading-none">{item.icon}</span>
                )}
              </div>
            )}
            <span>{item.label}</span>
          </DropdownMenuItem>
        );
      case "separator":
        return (
          <DropdownMenuSeparator key={idx} className="h-[2px] bg-black my-1" />
        );
      case "submenu":
        return (
          <DropdownMenuSub key={idx}>
            <DropdownMenuSubTrigger className={menuItemClass}>
              {item.icon && (
                <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                  {item.icon.startsWith("/") || item.icon.startsWith("http") ? (
                    <ThemedIcon
                      name={item.icon}
                      alt={item.label}
                      className="w-4 h-4 [image-rendering:pixelated]"
                    />
                  ) : (
                    <span className="text-xs leading-none">{item.icon}</span>
                  )}
                </div>
              )}
              <span>{item.label}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="px-0">
              {renderItems(item.items)}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        );
      case "checkbox":
        return (
          <DropdownMenuCheckboxItem
            key={idx}
            checked={item.checked}
            onSelect={item.onSelect}
            disabled={item.disabled}
            className="text-md h-6 min-w-[140px]"
          >
            {item.label}
          </DropdownMenuCheckboxItem>
        );
      case "radioGroup":
        return (
          <>
            {item.items.map((ri) => {
              const isActive = item.value === ri.value;
              return (
                <DropdownMenuCheckboxItem
                  key={ri.value}
                  checked={isActive}
                  onSelect={() => item.onChange(ri.value)}
                  className="text-md h-6 min-w-[140px]"
                >
                  {ri.label}
                </DropdownMenuCheckboxItem>
              );
            })}
          </>
        );
      default:
        return null;
    }
  });
}

// ------------------ Component ------------------
export function RightClickMenu({
  position,
  onClose,
  items,
  align = "start",
}: RightClickMenuProps) {
  const { play: playMenuOpen } = useSound(Sounds.MENU_OPEN);

  // Play open sound when menu appears
  useEffect(() => {
    if (position) {
      playMenuOpen();
    }
  }, [position, playMenuOpen]);

  if (!position) return null;

  return (
    <DropdownMenu open onOpenChange={(open) => !open && onClose()}>
      <DropdownMenuTrigger asChild>
        <div
          style={{
            position: "absolute",
            top: position.y,
            left: position.x,
            width: 0,
            height: 0,
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        sideOffset={4}
        alignOffset={4}
        className="px-0"
      >
        {renderItems(items)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
