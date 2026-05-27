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
import React, { MutableRefObject, ReactNode, useEffect, useRef } from "react";
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
      disabled?: boolean;
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
  "text-md h-6 px-3 active:bg-neutral-900 active:text-white min-w-[140px] flex items-center gap-2";

const menuItemKeyCache = new WeakMap<object, string>();
let menuItemKeySeed = 0;

function getMenuItemKey(item: MenuItem): string {
  const cached = menuItemKeyCache.get(item);
  if (cached) return cached;

  let key = "";
  if (item.type === "item" || item.type === "submenu" || item.type === "checkbox") {
    key = `${item.type}-${item.label}`;
  } else if (item.type === "radioGroup") {
    key = `${item.type}-${item.value}`;
  } else {
    key = "separator";
  }

  menuItemKeySeed += 1;
  const uniqueKey = `${key}-${menuItemKeySeed}`;
  menuItemKeyCache.set(item, uniqueKey);
  return uniqueKey;
}

// Touch fallback: Radix MenuItem's onSelect relies on the browser firing a
// synthesized `click` after pointerdown→pointerup. On touch devices (real iOS
// Safari with `touch-action: none` on body, Chrome's mobile emulation, etc.)
// that synthesized click is sometimes never dispatched — the user sees the
// item highlight but onSelect never runs. We fire the action manually on
// pointerup for touch/pen. A shared "lastFired" timestamp dedupes against any
// late-arriving synthesized click that would otherwise re-trigger onSelect.
const DOUBLE_FIRE_GUARD_MS = 500;

function makeTouchSelectHandler(
  onSelect: (() => void) | undefined,
  onClose: () => void,
  lastFiredRef: MutableRefObject<number>
) {
  if (!onSelect) return undefined;
  return (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    const now = performance.now();
    if (now - lastFiredRef.current < DOUBLE_FIRE_GUARD_MS) return;
    lastFiredRef.current = now;
    event.preventDefault();
    onSelect();
    onClose();
  };
}

function makeGuardedSelect(
  onSelect: (() => void) | undefined,
  lastFiredRef: MutableRefObject<number>
) {
  if (!onSelect) return undefined;
  return () => {
    const now = performance.now();
    if (now - lastFiredRef.current < DOUBLE_FIRE_GUARD_MS) return;
    lastFiredRef.current = now;
    onSelect();
  };
}

// ------------------ Renderer helpers ------------------
function renderItems(
  items: MenuItem[],
  onClose: () => void,
  lastFiredRef: MutableRefObject<number>
): ReactNode {
  return items.map((item) => {
    const itemKey = getMenuItemKey(item);
    switch (item.type) {
      case "item":
        return (
          <DropdownMenuItem
            key={itemKey}
            onSelect={makeGuardedSelect(item.onSelect, lastFiredRef)}
            onPointerUp={makeTouchSelectHandler(
              item.onSelect,
              onClose,
              lastFiredRef
            )}
            disabled={item.disabled}
            className={menuItemClass}
          >
            {item.icon && (
              <div className="size-4 flex items-center justify-center flex-shrink-0">
                {item.icon.startsWith("/") || item.icon.startsWith("http") ? (
                  <ThemedIcon
                    name={item.icon}
                    alt={item.label}
                    className="size-4 [image-rendering:pixelated]"
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
          <DropdownMenuSeparator key={itemKey} className="h-[2px] bg-black my-1" />
        );
      case "submenu":
        return (
          <DropdownMenuSub key={itemKey}>
            <DropdownMenuSubTrigger
              disabled={item.disabled}
              className={menuItemClass}
            >
              {item.icon && (
                <div className="size-4 flex items-center justify-center flex-shrink-0">
                  {item.icon.startsWith("/") || item.icon.startsWith("http") ? (
                    <ThemedIcon
                      name={item.icon}
                      alt={item.label}
                      className="size-4 [image-rendering:pixelated]"
                    />
                  ) : (
                    <span className="text-xs leading-none">{item.icon}</span>
                  )}
                </div>
              )}
              <span>{item.label}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="px-0">
              {renderItems(item.items, onClose, lastFiredRef)}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        );
      case "checkbox":
        return (
          <DropdownMenuCheckboxItem
            key={itemKey}
            checked={item.checked}
            onSelect={makeGuardedSelect(item.onSelect, lastFiredRef)}
            onPointerUp={makeTouchSelectHandler(
              item.onSelect,
              onClose,
              lastFiredRef
            )}
            disabled={item.disabled}
            className="text-md h-6 min-w-[140px]"
          >
            {item.label}
          </DropdownMenuCheckboxItem>
        );
      case "radioGroup":
        return (
          <React.Fragment key={itemKey}>
            {item.items.map((ri) => {
              const isActive = item.value === ri.value;
              const handleSelect = () => item.onChange(ri.value);
              return (
                <DropdownMenuCheckboxItem
                  key={ri.value}
                  checked={isActive}
                  onSelect={makeGuardedSelect(handleSelect, lastFiredRef)}
                  onPointerUp={makeTouchSelectHandler(
                    handleSelect,
                    onClose,
                    lastFiredRef
                  )}
                  className="text-md h-6 min-w-[140px]"
                >
                  {ri.label}
                </DropdownMenuCheckboxItem>
              );
            })}
          </React.Fragment>
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
  const lastFiredRef = useRef(0);

  useEffect(() => {
    if (position) {
      lastFiredRef.current = 0;
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
        {renderItems(items, onClose, lastFiredRef)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
