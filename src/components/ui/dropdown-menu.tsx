import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, CaretRight, Circle } from "@phosphor-icons/react";
import { useSound, Sounds } from "@/hooks/useSound";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useMediaQuery } from "@/hooks/useMediaQuery";

import { cn } from "@/lib/utils";

const DropdownMenu = ({
  children,
  onOpenChange,
  ...props
}: DropdownMenuPrimitive.DropdownMenuProps) => {
  const { play: playMenuOpen } = useSound(Sounds.MENU_OPEN);
  const { play: playMenuClose } = useSound(Sounds.MENU_CLOSE);

  return (
    <DropdownMenuPrimitive.Root
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
    </DropdownMenuPrimitive.Root>
  );
};
DropdownMenu.displayName = DropdownMenuPrimitive.Root.displayName;

const DropdownMenuTrigger = (
  {
    ref,
    className,
    style,
    ...props
  }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Trigger> & {
    ref?: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.Trigger>>;
  }
) => {
  const { isMacOSTheme } = useThemeFlags();

  const macosTextShadow = isMacOSTheme
    ? {
        textShadow: "0 2px 3px rgba(0, 0, 0, 0.25)",
      }
    : {};

  return (
    <DropdownMenuPrimitive.Trigger
      ref={ref}
      className={className}
      style={{ ...macosTextShadow, ...style }}
      {...props}
    />
  );
};
DropdownMenuTrigger.displayName = DropdownMenuPrimitive.Trigger.displayName;

const DropdownMenuGroup = DropdownMenuPrimitive.Group;

const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

const DropdownMenuSub = DropdownMenuPrimitive.Sub;

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const DropdownMenuSubTrigger = (
  {
    ref,
    className,
    inset,
    children,
    ...props
  }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean;
    ref?: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>>;
  }
) => {
  const { isWindowsTheme, isMacOSTheme } = useThemeFlags();

  return (
    <DropdownMenuPrimitive.SubTrigger
      ref={ref}
      className={cn(
        "flex cursor-default gap-2 select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent data-[state=open]:bg-accent [&_svg]:pointer-events-none [&_svg]:shrink-0",
        inset && "pl-8",
        className
      )}
      style={{
        fontFamily:
          isWindowsTheme || isMacOSTheme ? "var(--os-font-ui)" : undefined,
        fontSize:
          isWindowsTheme || isMacOSTheme
            ? isMacOSTheme
              ? "var(--os-menu-subtrigger-font-size) !important"
              : "var(--os-menu-subtrigger-font-size)"
            : undefined,
        ...(isMacOSTheme && {
          borderRadius: "0px",
          padding: "6px 12px 6px 16px",
          margin: "1px 0",
          WebkitFontSmoothing: "antialiased",
          textShadow: "0 2px 3px rgba(0, 0, 0, 0.25)",
        }),
      }}
      {...props}
    >
      {children}
      <CaretRight className="ml-auto" size={12} weight="bold" />
    </DropdownMenuPrimitive.SubTrigger>
  );
};
DropdownMenuSubTrigger.displayName =
  DropdownMenuPrimitive.SubTrigger.displayName;

const DropdownMenuSubContent = (
  {
    ref,
    className,
    style,
    ...props
  }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent> & {
    ref?: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.SubContent>>;
  }
) => {
  const { isMacOSTheme } = useThemeFlags();
  const isMobile = useMediaQuery("(max-width: 768px)");

  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent
        ref={ref}
        className={cn(
          // Use z-[10004] to ensure dropdown submenu content appears above menu content
          "z-[10004] min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
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
            ...(isMobile ? {} : { minWidth: "180px" }),
          }),
          ...(isMobile && { minWidth: "unset" }),
          ...style,
        }}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
};
DropdownMenuSubContent.displayName =
  DropdownMenuPrimitive.SubContent.displayName;

const DropdownMenuContent = (
  {
    ref,
    className,
    sideOffset = 4,
    style,
    container,
    ...props
  }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content> & {
    container?: HTMLElement | null;
    ref?: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.Content>>;
  }
) => {
  const { isMacOSTheme } = useThemeFlags();
  const isMobile = useMediaQuery("(max-width: 768px)");

  return (
    <DropdownMenuPrimitive.Portal container={container}>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          // Use z-[10003] to ensure dropdown content appears above the menubar (z-[10002])
          // This is critical for Safari where backdrop-filter creates new stacking contexts
          "z-[10003] min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
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
            ...(isMobile ? {} : { minWidth: style?.minWidth ?? "180px" }),
          }),
          ...(isMobile && { minWidth: "unset" }),
          ...style,
        }}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
};
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const DropdownMenuItem = (
  {
    ref,
    className,
    inset,
    ...props
  }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
    ref?: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.Item>>;
  }
) => {
  const { isWindowsTheme, isMacOSTheme } = useThemeFlags();

  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0",
        inset && "pl-8",
        className,
        "data-[state=checked]:!bg-transparent data-[state=checked]:text-foreground"
      )}
      style={{
        fontFamily:
          isWindowsTheme || isMacOSTheme ? "var(--os-font-ui)" : undefined,
        fontSize:
          isWindowsTheme || isMacOSTheme
            ? isMacOSTheme
              ? "var(--os-menu-item-font-size) !important"
              : "var(--os-menu-item-font-size)"
            : undefined,
        ...(isMacOSTheme && {
          borderRadius: "0px",
          padding: "6px 20px 6px 16px",
          margin: "1px 0",
          WebkitFontSmoothing: "antialiased",
          textShadow: "0 2px 3px rgba(0, 0, 0, 0.25)",
        }),
      }}
      {...props}
    />
  );
};
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

const DropdownMenuCheckboxItem = (
  {
    ref,
    className,
    children,
    checked,
    ...props
  }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem> & {
    ref?: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>>;
  }
) => {
  const {
    isWindowsTheme,
    isMacOSTheme,
    isSystem7Theme,
    isAquaMenuChrome,
  } = useThemeFlags();

  return (
    <DropdownMenuPrimitive.CheckboxItem
      ref={ref}
      className={cn(
        "relative flex cursor-default select-none items-center py-1.5 pl-8 pr-2 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        // Theme-specific hover/focus styles
        isSystem7Theme && "rounded-none focus:bg-black focus:text-white hover:bg-black hover:text-white mx-0",
        isMacOSTheme && "rounded-none focus:bg-[rgba(39,101,202,0.88)] focus:text-white hover:bg-[rgba(39,101,202,0.88)] hover:text-white",
        !isSystem7Theme && !isMacOSTheme && "rounded-sm focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground",
        className,
        "data-[state=checked]:text-foreground"
      )}
      style={{
        fontFamily:
          isWindowsTheme || isMacOSTheme ? "var(--os-font-ui)" : undefined,
        fontSize:
          isWindowsTheme || isMacOSTheme
            ? isMacOSTheme
              ? "var(--os-menu-item-font-size) !important"
              : "var(--os-menu-item-font-size)"
            : undefined,
        ...(!isAquaMenuChrome && {
          padding: "2px 12px 2px 32px",
          margin: "0",
        }),
        ...(isMacOSTheme && {
          borderRadius: "0px",
          padding: "6px 20px 6px 32px",
          margin: "1px 0",
          WebkitFontSmoothing: "antialiased",
          textShadow: "0 2px 3px rgba(0, 0, 0, 0.25)",
        }),
      }}
      checked={checked}
      {...props}
    >
      <span className="absolute left-3 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check size={12} weight="bold" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
};
DropdownMenuCheckboxItem.displayName =
  DropdownMenuPrimitive.CheckboxItem.displayName;

const DropdownMenuRadioItem = (
  {
    ref,
    className,
    children,
    ...props
  }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem> & {
    ref?: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>>;
  }
) => {
  const { isWindowsTheme, isMacOSTheme } = useThemeFlags();

  return (
    <DropdownMenuPrimitive.RadioItem
      ref={ref}
      className={cn(
        "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      style={{
        fontFamily:
          isWindowsTheme || isMacOSTheme ? "var(--os-font-ui)" : undefined,
        fontSize: isWindowsTheme ? "var(--os-menu-item-font-size)" : undefined,
      }}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Circle size={8} weight="fill" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
};
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;

const DropdownMenuLabel = (
  {
    ref,
    className,
    inset,
    ...props
  }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean;
    ref?: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.Label>>;
  }
) => {
  const { isWindowsTheme, isMacOSTheme } = useThemeFlags();

  return (
    <DropdownMenuPrimitive.Label
      ref={ref}
      className={cn(
        "px-2 py-1.5 text-sm font-semibold",
        inset && "pl-8",
        className
      )}
      style={{
        fontFamily:
          isWindowsTheme || isMacOSTheme ? "var(--os-font-ui)" : undefined,
        fontSize: isWindowsTheme ? "var(--os-menu-item-font-size)" : undefined,
      }}
      {...props}
    />
  );
};
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

const DropdownMenuSeparator = (
  {
    ref,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator> & {
    ref?: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.Separator>>;
  }
) => {
  const { isSystem7Theme, isMacOSTheme } = useThemeFlags();

  return (
    <DropdownMenuPrimitive.Separator
      ref={ref}
      className={cn(
        className,
        "-mx-1 my-1 h-[1px] border-b-0",
        !isMacOSTheme && "border-t border-muted",
        isSystem7Theme && "border-dotted",
        !isSystem7Theme && !isMacOSTheme && "border-solid"
      )}
      style={{
        ...(isMacOSTheme && {
          backgroundColor: "rgba(0, 0, 0, 0.15)",
          border: "none",
          margin: "4px 0",
          height: "1px",
        }),
      }}
      {...props}
    />
  );
};
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn("ml-auto text-xs tracking-widest opacity-60", className)}
      {...props}
    />
  );
};
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
};
