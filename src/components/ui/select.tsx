import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, CaretDown, CaretUp } from "@phosphor-icons/react";
import { useSound, Sounds } from "@/hooks/useSound";
import { useThemeStore } from "@/stores/useThemeStore";

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

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => {
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);
  const currentTheme = useThemeStore((state) => state.current);

  const [isFocused, setIsFocused] = React.useState(false);
  const [isPressed, setIsPressed] = React.useState(false);

  const isMacOSTheme = currentTheme === "macosx";
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        // Base classes for non-macOS themes
        !isMacOSTheme &&
          "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm [border-image:url('/assets/button.svg')_30_stretch] active:[border-image:url('/assets/button-default.svg')_60_stretch] focus:[border-image:url('/assets/button-default.svg')_60_stretch] border-[5px] ring-offset-background placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
        // macOS theme classes
        isMacOSTheme &&
          "macos-select-trigger flex w-full items-center justify-between whitespace-nowrap rounded px-2 py-1 text-sm placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
        className
      )}
      style={{
        fontFamily: isXpTheme
          ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
          : isMacOSTheme
          ? '"LucidaGrande", "Lucida Grande", "AquaKana", "Hiragino Sans", "Hiragino Sans GB", "Heiti SC", "Lucida Sans Unicode", sans-serif'
          : undefined,
        fontSize: isXpTheme ? "11px" : isMacOSTheme ? "14px" : undefined,
        ...(isXpTheme && {
          color: "black",
        }),
        ...(isMacOSTheme && {
          height: "24px", // Match Input h-6 height for macOS theme
          lineHeight: 1.5,
          minWidth: "60px",
          borderRadius: "6px",
          position: "relative",
          overflow: "hidden",
          cursor: "default",
          border: "none",
          boxSizing: "border-box",
          WebkitFontSmoothing: "antialiased",
          background: isPressed
            ? "linear-gradient(rgba(140, 140, 140, 0.625), rgba(235, 235, 235, 0.625))"
            : "linear-gradient(rgba(160, 160, 160, 0.625), rgba(255, 255, 255, 0.625))",
          boxShadow: isPressed
            ? "inset 0 1px 2px rgba(0, 0, 0, 0.3), inset 0 1px 1px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.2)"
            : isFocused
            ? "0 2px 3px rgba(0, 0, 0, 0.2), 0 1px 1px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.3), 0 0 3px var(--os-color-selection-glow)"
            : "0 2px 3px rgba(0, 0, 0, 0.2), 0 1px 1px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.3)",
          color: "black",
          textShadow: "0 2px 3px rgba(0, 0, 0, 0.25)",
          paddingRight: "24px",
        }),
      }}
      onClick={() => playClick()}
      onFocus={(e) => {
        setIsFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setIsFocused(false);
        props.onBlur?.(e);
      }}
      onMouseDown={(e) => {
        setIsPressed(true);
        props.onMouseDown?.(e);
      }}
      onMouseUp={(e) => {
        setIsPressed(false);
        props.onMouseUp?.(e);
      }}
      onMouseLeave={(e) => {
        setIsPressed(false);
        props.onMouseLeave?.(e);
      }}
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
});
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      className
    )}
    {...props}
  >
    <CaretUp size={12} weight="bold" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      className
    )}
    {...props}
  >
    <CaretDown size={12} weight="bold" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => {
  const currentTheme = useThemeStore((state) => state.current);
  const isMacOSTheme = currentTheme === "macosx";

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        className={cn(
          "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className
        )}
        style={{
          ...(isMacOSTheme && {
            border: "none",
            borderRadius: "0px",
            background: "var(--os-pinstripe-window)",
            opacity: "0.92",
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
            padding: "4px 0px",
          }),
        }}
        position={position}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "p-1",
            position === "popper" &&
              "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]",
            isMacOSTheme && "p-0"
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => {
  const currentTheme = useThemeStore((state) => state.current);

  const isMacOSTheme = currentTheme === "macosx";
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  return (
    <SelectPrimitive.Label
      ref={ref}
      className={cn("px-2 py-1.5 text-sm font-semibold", className)}
      style={{
        fontFamily: isXpTheme
          ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
          : isMacOSTheme
          ? '"LucidaGrande", "Lucida Grande", "AquaKana", "Hiragino Sans", "Hiragino Sans GB", "Heiti SC", "Lucida Sans Unicode", sans-serif'
          : undefined,
        fontSize: isXpTheme ? "11px" : isMacOSTheme ? "11px" : undefined,
        ...(isMacOSTheme && {
          WebkitFontSmoothing: "antialiased",
          fontSmooth: "auto",
          textShadow: "0 2px 3px rgba(0, 0, 0, 0.25)",
        }),
      }}
      {...props}
    />
  );
});
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => {
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);
  const currentTheme = useThemeStore((state) => state.current);

  const isMacOSTheme = currentTheme === "macosx";
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      style={{
        fontFamily: isXpTheme
          ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
          : isMacOSTheme
          ? '"LucidaGrande", "Lucida Grande", "AquaKana", "Hiragino Sans", "Hiragino Sans GB", "Heiti SC", "Lucida Sans Unicode", sans-serif'
          : undefined,
        fontSize: isXpTheme
          ? "11px"
          : isMacOSTheme
          ? "13px !important"
          : undefined,
        ...(isMacOSTheme && {
          WebkitFontSmoothing: "antialiased",
          fontSmooth: "auto",
          borderRadius: "0px",
          padding: "6px 20px 6px 16px",
          textShadow: "0 2px 3px rgba(0, 0, 0, 0.25)",
        }),
      }}
      onSelect={(event) => {
        playClick();
        props.onSelect?.(event);
      }}
      {...props}
    >
      <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check size={12} weight="bold" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
});
SelectItem.displayName = SelectPrimitive.Item.displayName;

interface SelectItemWithDescriptionProps
  extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> {
  description?: string;
}

const SelectItemWithDescription = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  SelectItemWithDescriptionProps
>(({ className, children, description, ...props }, ref) => {
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);
  const currentTheme = useThemeStore((state) => state.current);

  const isMacOSTheme = currentTheme === "macosx";
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        "group relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      style={{
        fontFamily: isXpTheme
          ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
          : isMacOSTheme
          ? '"LucidaGrande", "Lucida Grande", "AquaKana", "Hiragino Sans", "Hiragino Sans GB", "Heiti SC", "Lucida Sans Unicode", sans-serif'
          : undefined,
        fontSize: isXpTheme
          ? "11px"
          : isMacOSTheme
          ? "13px !important"
          : undefined,
        ...(isMacOSTheme && {
          WebkitFontSmoothing: "antialiased",
          fontSmooth: "auto",
          borderRadius: "0px",
          padding: "8px 20px 8px 16px",
          textShadow: "0 2px 3px rgba(0, 0, 0, 0.25)",
        }),
      }}
      onSelect={(event) => {
        playClick();
        props.onSelect?.(event);
      }}
      {...props}
    >
      <span className="absolute right-2 top-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check size={12} weight="bold" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <div className="flex flex-col gap-0.5">
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
        {description && (
          <span className="text-[11px] text-gray-500 group-focus:text-inherit font-normal leading-tight">
            {description}
          </span>
        )}
      </div>
    </SelectPrimitive.Item>
  );
});
SelectItemWithDescription.displayName = "SelectItemWithDescription";

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-muted", className)}
    {...props}
  />
));
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
