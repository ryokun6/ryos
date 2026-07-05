import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, CaretDown, CaretUp } from "@phosphor-icons/react";
import { useSound, Sounds } from "@/hooks/useSound";
import { useThemeFlags } from "@/hooks/useThemeFlags";

import { cn } from "@/lib/utils";

const Select = ({ children, onOpenChange, ...props }: SelectPrimitive.SelectProps) => {
  const { play: playMenuOpen } = useSound(Sounds.MENU_OPEN);
  const { play: playMenuClose } = useSound(Sounds.MENU_CLOSE);

  return (
    <SelectPrimitive.Root
      {...props}
      onOpenChange={(open) => {
        if (open) {
          playMenuOpen();
        } else {
          playMenuClose();
        }
        onOpenChange?.(open);
      }}
    >
      {children}
    </SelectPrimitive.Root>
  );
};

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

const SelectTrigger = (
  {
    ref,
    className,
    children,
    ...props
  }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & {
    ref?: React.Ref<React.ElementRef<typeof SelectPrimitive.Trigger>>;
  }
) => {
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);
  const { isMacOSTheme, isWindowsTheme } = useThemeFlags();

  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        !isMacOSTheme &&
          "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm [border-image:url('/assets/button.svg')_30_stretch] active:[border-image:url('/assets/button-default.svg')_60_stretch] focus:[border-image:url('/assets/button-default.svg')_60_stretch] border-[5px] ring-offset-background placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
        isMacOSTheme &&
          "macos-select-trigger os-select-trigger-macos flex w-full items-center justify-between whitespace-nowrap px-2 py-1 text-sm placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
        className
      )}
      style={{
        fontFamily: isWindowsTheme ? "var(--os-font-ui)" : undefined,
        fontSize: isWindowsTheme ? "var(--os-menu-item-font-size)" : undefined,
        ...(isWindowsTheme && { color: "black" }),
      }}
      onClick={() => playClick()}
      {...props}
    >
      {children}
      {!isMacOSTheme && (
        <SelectPrimitive.Icon asChild>
          <CaretDown size={12} className="opacity-50" weight="bold" />
        </SelectPrimitive.Icon>
      )}
    </SelectPrimitive.Trigger>
  );
};
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

// Custom scroll buttons instead of Radix's SelectPrimitive.ScrollUp/DownButton.
// The Radix buttons unmount/remount as the viewport crosses the top/bottom edge,
// and every remount runs a layout effect that scrollIntoView()s the focused
// (selected) item — snapping the list back to the selection while the user is
// scrolling (worst on iOS touch, where focus never leaves the selected item).
// See radix-ui/primitives#3686. These buttons read the viewport directly, never
// force focus-based scrolling, and stay mounted while the list is scrollable so
// the layout doesn't shift mid-scroll.
const SelectScrollButton = ({
  direction,
  viewport,
  className,
}: {
  direction: "up" | "down";
  viewport: HTMLDivElement | null;
  className?: string;
}) => {
  const [isScrollable, setIsScrollable] = React.useState(false);
  const [canScroll, setCanScroll] = React.useState(false);
  const autoScrollTimerRef = React.useRef<number | null>(null);

  React.useLayoutEffect(() => {
    if (!viewport) return;
    const update = () => {
      const maxScroll = viewport.scrollHeight - viewport.clientHeight;
      setIsScrollable(maxScroll > 1);
      setCanScroll(
        direction === "up"
          ? viewport.scrollTop > 0
          : Math.ceil(viewport.scrollTop) < maxScroll
      );
    };
    update();
    viewport.addEventListener("scroll", update);
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => {
      viewport.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [viewport, direction]);

  const stopAutoScroll = React.useCallback(() => {
    if (autoScrollTimerRef.current !== null) {
      window.clearInterval(autoScrollTimerRef.current);
      autoScrollTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => stopAutoScroll, [stopAutoScroll]);

  const startAutoScroll = React.useCallback(() => {
    if (!viewport || autoScrollTimerRef.current !== null) return;
    autoScrollTimerRef.current = window.setInterval(() => {
      const step =
        viewport.querySelector<HTMLElement>('[role="option"]')?.offsetHeight ??
        24;
      viewport.scrollTop += direction === "up" ? -step : step;
    }, 50);
  }, [viewport, direction]);

  if (!isScrollable) return null;

  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 cursor-default touch-none select-none items-center justify-center py-1 transition-opacity",
        !canScroll && "opacity-30",
        className
      )}
      onPointerDown={startAutoScroll}
      onPointerMove={(event) => {
        if (event.pointerType === "mouse") startAutoScroll();
      }}
      onPointerUp={stopAutoScroll}
      onPointerLeave={stopAutoScroll}
      onPointerCancel={stopAutoScroll}
    >
      {direction === "up" ? (
        <CaretUp size={12} weight="bold" />
      ) : (
        <CaretDown size={12} weight="bold" />
      )}
    </div>
  );
};

const SelectScrollUpButton = ({ className, viewport }: {
  className?: string;
  viewport: HTMLDivElement | null;
}) => <SelectScrollButton direction="up" viewport={viewport} className={className} />;
SelectScrollUpButton.displayName = "SelectScrollUpButton";

const SelectScrollDownButton = ({ className, viewport }: {
  className?: string;
  viewport: HTMLDivElement | null;
}) => <SelectScrollButton direction="down" viewport={viewport} className={className} />;
SelectScrollDownButton.displayName = "SelectScrollDownButton";

const SelectContent = (
  {
    ref,
    className,
    children,
    position = "popper",
    ...props
  }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & {
    ref?: React.Ref<React.ElementRef<typeof SelectPrimitive.Content>>;
  }
) => {
  const { isMacOSTheme, isAquaGlass } = useThemeFlags();
  const [viewport, setViewport] = React.useState<HTMLDivElement | null>(null);

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        className={cn(
          // origin-[…]: scale from the trigger side instead of the element center.
          // fill-mode-forwards: hold the exit end-state until Radix unmounts —
          // without it Safari can paint one unanimated frame (visible jitter).
          "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md origin-[var(--radix-select-content-transform-origin)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fill-mode-forwards data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className
        )}
        style={{
          ...(isMacOSTheme && {
            border: "none",
            borderRadius: "0px",
            background: "var(--os-pinstripe-window)",
            // Aqua Glass gets its translucency from the frosted background in
            // themes.css; an inline opacity would block the open/close fade.
            ...(isAquaGlass ? {} : { opacity: "0.92" }),
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
            padding: "4px 0px",
          }),
        }}
        position={position}
        {...props}
      >
        <SelectScrollUpButton viewport={viewport} />
        <SelectPrimitive.Viewport
          ref={setViewport}
          className={cn(
            "p-1 overscroll-contain",
            position === "popper" &&
              "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]",
            isMacOSTheme && "p-0"
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton viewport={viewport} />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
};
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = (
  {
    ref,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label> & {
    ref?: React.Ref<React.ElementRef<typeof SelectPrimitive.Label>>;
  }
) => (<SelectPrimitive.Label
  ref={ref}
  className={cn("px-2 py-1.5 text-sm font-semibold", className)}
  {...props}
/>);
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = (
  {
    ref,
    className,
    children,
    ...props
  }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> & {
    ref?: React.Ref<React.ElementRef<typeof SelectPrimitive.Item>>;
  }
) => {
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);

  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        "os-select-item relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      onSelect={(event) => {
        playClick();
        props.onSelect?.(event);
      }}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check size={12} weight="bold" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
};
SelectItem.displayName = SelectPrimitive.Item.displayName;

interface SelectItemWithDescriptionProps
  extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> {
  description?: string;
}

const SelectItemWithDescription = (
  {
    ref,
    className,
    children,
    description,
    ...props
  }: SelectItemWithDescriptionProps & {
    ref?: React.Ref<React.ElementRef<typeof SelectPrimitive.Item>>;
  }
) => {
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);

  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        "os-select-item-with-description group relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      onSelect={(event) => {
        playClick();
        props.onSelect?.(event);
      }}
      {...props}
    >
      <span className="absolute right-2 top-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check size={12} weight="bold" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <div className="flex flex-col gap-0.5">
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
        {description && (
          <span className="text-[11px] text-neutral-500 group-focus:text-inherit font-normal leading-tight">
            {description}
          </span>
        )}
      </div>
    </SelectPrimitive.Item>
  );
};
SelectItemWithDescription.displayName = "SelectItemWithDescription";

const SelectSeparator = (
  {
    ref,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator> & {
    ref?: React.Ref<React.ElementRef<typeof SelectPrimitive.Separator>>;
  }
) => (<SelectPrimitive.Separator
  ref={ref}
  className={cn("-mx-1 my-1 h-px bg-muted", className)}
  {...props}
/>);
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectItemWithDescription,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
