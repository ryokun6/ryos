import * as React from "react";
import { Menu as DropdownMenuPrimitive } from "@base-ui/react/menu";
import { Check, CaretRight, Circle } from "@phosphor-icons/react";
import { useSound, Sounds } from "@/hooks/useSound";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useMediaQuery } from "@/hooks/useMediaQuery";

import { cn } from "@/lib/utils";

const DropdownMenu = ({
  children,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) => {
  const { play: playMenuOpen } = useSound(Sounds.MENU_OPEN);
  const { play: playMenuClose } = useSound(Sounds.MENU_CLOSE);
  const openRef = React.useRef(Boolean(props.open ?? props.defaultOpen));

  React.useEffect(() => {
    if (props.open !== undefined) {
      openRef.current = props.open;
    }
  }, [props.open]);

  return (
    <DropdownMenuPrimitive.Root
      {...props}
      onOpenChange={(open, eventDetails) => {
        if (open !== openRef.current) {
          openRef.current = open;
          if (open) {
            playMenuOpen();
          } else {
            playMenuClose();
          }
        }
        onOpenChange?.(open, eventDetails);
      }}
    >
      {children}
    </DropdownMenuPrimitive.Root>
  );
};
DropdownMenu.displayName = "DropdownMenu";

const DropdownMenuTrigger = (
  {
    ref,
    className,
    style,
    asChild = false,
    children,
    ...props
  }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Trigger> & {
    asChild?: boolean;
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
      ref={ref as React.Ref<HTMLButtonElement>}
      className={className}
      style={{ ...macosTextShadow, ...style }}
      render={asChild && React.isValidElement(children) ? children : undefined}
      {...props}
    >
      {asChild ? null : children}
    </DropdownMenuPrimitive.Trigger>
  );
};
DropdownMenuTrigger.displayName = "DropdownMenuTrigger";

const DropdownMenuGroup = DropdownMenuPrimitive.Group;

const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

const DropdownMenuSub = DropdownMenuPrimitive.SubmenuRoot;

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const DropdownMenuSubTrigger = (
  {
    ref,
    className,
    inset,
    children,
    ...props
  }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubmenuTrigger> & {
    inset?: boolean;
    ref?: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.SubmenuTrigger>>;
  }
) => {
  const { isWindowsTheme, isMacOSTheme } = useThemeFlags();

  return (
    <DropdownMenuPrimitive.SubmenuTrigger
      ref={ref}
      className={cn(
        "flex cursor-default gap-2 select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent data-[open]:bg-accent data-[state=open]:bg-accent [&_svg]:pointer-events-none [&_svg]:shrink-0",
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
      render={(triggerProps, state) => (
        <div
          {...triggerProps}
          data-state={state.open ? "open" : "closed"}
        />
      )}
      {...props}
    >
      {children}
      <CaretRight className="ml-auto" size={12} weight="bold" />
    </DropdownMenuPrimitive.SubmenuTrigger>
  );
};
DropdownMenuSubTrigger.displayName =
  DropdownMenuPrimitive.SubmenuTrigger.displayName;

const DropdownMenuSubContent = (
  {
    ref,
    className,
    style,
    children,
    align,
    alignOffset,
    collisionAvoidance,
    collisionBoundary,
    collisionPadding,
    side = "inline-end",
    sideOffset = 4,
    positionMethod,
    ...props
  }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Popup> & {
    ref?: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.Popup>>;
  } & Pick<
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Positioner>,
    | "align"
    | "alignOffset"
    | "collisionAvoidance"
    | "collisionBoundary"
    | "collisionPadding"
    | "positionMethod"
    | "side"
    | "sideOffset"
  >
) => {
  const { isMacOSTheme, isAquaGlass } = useThemeFlags();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const styleObject = typeof style === "function" ? undefined : style;

  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Positioner
        className="z-[10004]"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        positionMethod={positionMethod}
        collisionAvoidance={
          collisionAvoidance ?? {
            side: "flip",
            align: "shift",
            fallbackAxisSide: "none",
          }
        }
        collisionBoundary={collisionBoundary}
        collisionPadding={collisionPadding ?? 8}
        data-ryos-popper-content-wrapper=""
      >
        <DropdownMenuPrimitive.Popup
          ref={ref}
          data-ryos-popper-content=""
          data-ryos-menu-content=""
          className={cn(
            // Use z-[10004] to ensure dropdown submenu content appears above menu content
            // origin-[…]: scale from the trigger side instead of the element center.
            "z-[10004] min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg origin-[var(--transform-origin)] data-[open]:animate-in data-[closed]:animate-out data-[closed]:fill-mode-forwards data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fill-mode-forwards data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
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
              ...(isMobile ? {} : { minWidth: "180px" }),
            }),
            ...(isMobile && { minWidth: "unset" }),
            ...styleObject,
          }}
          render={(popupProps, state) => (
            <div
              {...popupProps}
              data-state={state.open ? "open" : "closed"}
            />
          )}
          {...props}
        >
          <DropdownMenuPrimitive.Viewport className="max-h-[inherit] overflow-y-auto">
            {children}
          </DropdownMenuPrimitive.Viewport>
        </DropdownMenuPrimitive.Popup>
      </DropdownMenuPrimitive.Positioner>
    </DropdownMenuPrimitive.Portal>
  );
};
DropdownMenuSubContent.displayName =
  DropdownMenuPrimitive.Popup.displayName;

const DropdownMenuContent = (
  {
    ref,
    className,
    sideOffset = 4,
    align,
    alignOffset,
    side,
    collisionPadding,
    collisionBoundary,
    collisionAvoidance,
    positionMethod,
    children,
    style,
    container,
    onCloseAutoFocus: _onCloseAutoFocus,
    ...props
  }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Popup> &
    Pick<
      React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Positioner>,
      | "align"
      | "alignOffset"
      | "collisionAvoidance"
      | "collisionBoundary"
      | "collisionPadding"
      | "positionMethod"
      | "side"
      | "sideOffset"
    > & {
    container?: HTMLElement | null;
    onCloseAutoFocus?: (event: { preventDefault: () => void }) => void;
    ref?: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.Popup>>;
  }
) => {
  const { isMacOSTheme, isAquaGlass } = useThemeFlags();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const styleObject = typeof style === "function" ? undefined : style;

  return (
    <DropdownMenuPrimitive.Portal container={container}>
      <DropdownMenuPrimitive.Positioner
        className="z-[10003]"
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        side={side}
        positionMethod={positionMethod}
        collisionAvoidance={collisionAvoidance}
        collisionBoundary={collisionBoundary}
        collisionPadding={collisionPadding}
        data-ryos-popper-content-wrapper=""
      >
        <DropdownMenuPrimitive.Popup
          ref={ref}
          data-ryos-popper-content=""
          data-ryos-menu-content=""
          className={cn(
            // Use z-[10003] to ensure dropdown content appears above the menubar (z-[10002])
            // This is critical for Safari where backdrop-filter creates new stacking contexts
            "z-[10003] min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
            // origin-[…]: scale from the trigger side instead of the element center.
            "origin-[var(--transform-origin)] data-[open]:animate-in data-[closed]:animate-out data-[closed]:fill-mode-forwards data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fill-mode-forwards data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
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
              ...(isMobile ? {} : { minWidth: styleObject?.minWidth ?? "180px" }),
            }),
            ...(isMobile && { minWidth: "unset" }),
            ...styleObject,
          }}
          render={(popupProps, state) => (
            <div
              {...popupProps}
              data-state={state.open ? "open" : "closed"}
            />
          )}
          {...props}
        >
          <DropdownMenuPrimitive.Viewport className="max-h-[inherit] overflow-y-auto">
            {children}
          </DropdownMenuPrimitive.Viewport>
        </DropdownMenuPrimitive.Popup>
      </DropdownMenuPrimitive.Positioner>
    </DropdownMenuPrimitive.Portal>
  );
};
DropdownMenuContent.displayName = DropdownMenuPrimitive.Popup.displayName;

const DropdownMenuItem = (
  {
    ref,
    className,
    inset,
    onSelect,
    onClick,
    ...props
  }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
    onSelect?: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>["onClick"];
    ref?: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.Item>>;
  }
) => {
  const { isWindowsTheme, isMacOSTheme, isAquaGlass } = useThemeFlags();

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
          padding: isAquaGlass ? "4px 10px" : "6px 20px 6px 16px",
          margin: "1px 0",
          WebkitFontSmoothing: "antialiased",
          textShadow: "0 2px 3px rgba(0, 0, 0, 0.25)",
        }),
      }}
      onClick={(event) => {
        onSelect?.(event);
        onClick?.(event);
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
    onSelect,
    onClick,
    ...props
  }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem> & {
    onSelect?: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>["onClick"];
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
      onClick={(event) => {
        onSelect?.(event);
        onClick?.(event);
      }}
      render={(itemProps, state) => (
        <div
          {...itemProps}
          data-state={state.checked ? "checked" : "unchecked"}
        />
      )}
      {...props}
    >
      <span className="absolute left-3 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.CheckboxItemIndicator>
          <Check size={12} weight="bold" />
        </DropdownMenuPrimitive.CheckboxItemIndicator>
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
    onSelect,
    onClick,
    ...props
  }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem> & {
    onSelect?: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>["onClick"];
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
      onClick={(event) => {
        onSelect?.(event);
        onClick?.(event);
      }}
      render={(itemProps, state) => (
        <div
          {...itemProps}
          data-state={state.checked ? "checked" : "unchecked"}
        />
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.RadioItemIndicator>
          <Circle size={8} weight="fill" />
        </DropdownMenuPrimitive.RadioItemIndicator>
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
  }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.GroupLabel> & {
    inset?: boolean;
    ref?: React.Ref<React.ElementRef<typeof DropdownMenuPrimitive.GroupLabel>>;
  }
) => {
  const { isWindowsTheme, isMacOSTheme } = useThemeFlags();

  return (
    <DropdownMenuPrimitive.GroupLabel
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
DropdownMenuLabel.displayName = DropdownMenuPrimitive.GroupLabel.displayName;

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
