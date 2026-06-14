import * as React from "react"
import { Menubar as MenubarPrimitive } from "@base-ui/react/menubar"
import { Menu as MenubarMenuPrimitive } from "@base-ui/react/menu"
import { Check, CaretRight, Circle } from "@phosphor-icons/react"
import { useSound, Sounds } from "@/hooks/useSound"
import { useThemeFlags } from "@/hooks/useThemeFlags"
import { useMediaQuery } from "@/hooks/useMediaQuery"

import { cn } from "@/lib/utils"

// Context to track if we're switching between menus (to skip animations)
const MenubarSwitchingContext = React.createContext<boolean>(false)
const MenubarOpenContext = React.createContext<{
  currentValueRef: React.MutableRefObject<string | undefined>;
  setOpenValue: (value: string | undefined) => void;
} | null>(null)

const MenubarMenu = ({
  value,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof MenubarMenuPrimitive.Root> & {
  value?: string;
}) => {
  const generatedValue = React.useId()
  const menuValue = value ?? generatedValue
  const context = React.use(MenubarOpenContext)

  return (
    <MenubarMenuPrimitive.Root
      {...props}
      onOpenChange={(open, eventDetails) => {
        if (open) {
          context?.setOpenValue(open ? menuValue : undefined)
        } else if (
          eventDetails.reason !== "sibling-open" &&
          context?.currentValueRef.current === menuValue
        ) {
          context.setOpenValue(undefined)
        }
        onOpenChange?.(open, eventDetails)
      }}
    />
  )
}

const MenubarGroup = MenubarMenuPrimitive.Group

const MenubarPortal = MenubarMenuPrimitive.Portal

const MenubarSub = MenubarMenuPrimitive.SubmenuRoot

const MenubarRadioGroup = MenubarMenuPrimitive.RadioGroup

const Menubar = (
  {
    ref,
    className,
    onValueChange,
    value: _value,
    ...props
  }: React.ComponentPropsWithoutRef<typeof MenubarPrimitive> & {
    value?: string;
    onValueChange?: (value: string) => void;
    ref?: React.Ref<React.ElementRef<typeof MenubarPrimitive>>;
  }
) => {
  const { play: playMenuOpen } = useSound(Sounds.MENU_OPEN)
  const { play: playMenuClose } = useSound(Sounds.MENU_CLOSE)
  const [isSwitching, setIsSwitching] = React.useState(false)
  const currentValueRef = React.useRef<string | undefined>(undefined)
  const closeTimerRef = React.useRef<number | undefined>(undefined)

  React.useEffect(() => {
    return () => {
      if (closeTimerRef.current !== undefined) {
        window.clearTimeout(closeTimerRef.current)
      }
    }
  }, [])

  const handleValueChange = (value: string | undefined) => {
    if (value) {
      if (closeTimerRef.current !== undefined) {
        window.clearTimeout(closeTimerRef.current)
        closeTimerRef.current = undefined
      }

      const currentValue = currentValueRef.current
      if (value === currentValue) return

      if (!currentValue) {
        // Opening a menu from closed state
        playMenuOpen()
        setIsSwitching(false)
      } else {
        // Switching between menus - skip sound and animation for instant swap
        setIsSwitching(true)
      }

      currentValueRef.current = value
      onValueChange?.(value)
      return
    }

    const currentValue = currentValueRef.current
    if (!currentValue) return

    if (closeTimerRef.current !== undefined) {
      window.clearTimeout(closeTimerRef.current)
    }

    closeTimerRef.current = window.setTimeout(() => {
      if (currentValueRef.current !== currentValue) return

      currentValueRef.current = undefined
      playMenuClose()
      setIsSwitching(false)
      onValueChange?.("")
      closeTimerRef.current = undefined
    }, 80)
  }

  return (
    <MenubarOpenContext.Provider
      value={{ currentValueRef, setOpenValue: handleValueChange }}
    >
      <MenubarSwitchingContext.Provider value={isSwitching}>
        <MenubarPrimitive
          ref={ref}
          className={cn(
            "flex items-center space-x-1 rounded-md p-1",
            className
          )}
          {...props}
        />
      </MenubarSwitchingContext.Provider>
    </MenubarOpenContext.Provider>
  )
}
Menubar.displayName = "Menubar"

const MenubarTrigger = (
  {
    ref,
    className,
    style,
    ...props
  }: React.ComponentPropsWithoutRef<typeof MenubarMenuPrimitive.Trigger> & {
    ref?: React.Ref<React.ElementRef<typeof MenubarMenuPrimitive.Trigger>>;
  }
) => {
  const { isWindowsTheme, isSystem7Theme, isMacOSTheme } = useThemeFlags()

  // Theme-specific styles for the trigger
  const themeStyles: React.CSSProperties = {
    ...(isMacOSTheme && {
      textShadow: "0 2px 3px rgba(0, 0, 0, 0.25)",
    }),
  }

  // Theme-specific classes
  const themeClasses = cn(
    // Base styles - h-full + self-stretch ensures trigger fills parent height (works with both CSS var and the desktop shell's 32px)
    "flex cursor-default select-none items-center h-full self-stretch px-2 text-md font-medium outline-none",
    // Windows themes: plain text style, no background changes, add menubar-trigger class for CSS override
    isWindowsTheme && "rounded-none menubar-trigger",
    // System 7: black background, white text when open
    // Explicitly clear state when closed to prevent lingering styles (overrides focus states)
    isSystem7Theme && "rounded-none data-[state=open]:bg-[var(--os-color-selection-bg)] data-[state=open]:text-[var(--os-color-selection-text)] data-[state=closed]:!bg-transparent data-[state=closed]:!text-inherit",
    // macOS X: blue background (matches menu selection color), white text when open
    // Explicitly clear state when closed to prevent lingering styles (use !important to override focus states)
    isMacOSTheme && "rounded-none data-[state=open]:bg-[var(--os-color-selection-bg)] data-[state=open]:text-[var(--os-color-selection-text)] data-[state=closed]:!bg-transparent data-[state=closed]:!text-inherit",
    // Default/other themes
    !isWindowsTheme && !isSystem7Theme && !isMacOSTheme && "rounded-sm data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
    className
  )

  return (
    <MenubarMenuPrimitive.Trigger
      ref={ref as React.Ref<HTMLButtonElement>}
      className={themeClasses}
      style={{ ...themeStyles, ...style }}
      render={(triggerProps, state) => (
        <button
          {...triggerProps}
          data-state={state.open ? "open" : "closed"}
        />
      )}
      {...props}
    />
  )
}
MenubarTrigger.displayName = "MenubarTrigger"

const MenubarSubTrigger = (
  {
    ref,
    className,
    inset,
    children,
    ...props
  }: React.ComponentPropsWithoutRef<typeof MenubarMenuPrimitive.SubmenuTrigger> & {
    inset?: boolean
    ref?: React.Ref<React.ElementRef<typeof MenubarMenuPrimitive.SubmenuTrigger>>
  }
) => {
  const { isWindowsTheme, isMacOSTheme, isSystem7Theme, isAquaGlass } = useThemeFlags()

  return (
    <MenubarMenuPrimitive.SubmenuTrigger
      ref={ref}
      className={cn(
        "flex cursor-default gap-2 select-none items-center px-2 py-1.5 text-sm outline-none [&_svg]:pointer-events-none [&_svg]:shrink-0",
        // Theme-specific hover/focus styles
        isSystem7Theme && "rounded-none focus:bg-[var(--os-color-selection-bg)] focus:text-[var(--os-color-selection-text)] data-[open]:bg-[var(--os-color-selection-bg)] data-[open]:text-[var(--os-color-selection-text)] data-[state=open]:bg-[var(--os-color-selection-bg)] data-[state=open]:text-[var(--os-color-selection-text)] mx-0",
        isMacOSTheme && "rounded-none focus:bg-[var(--os-color-selection-bg)] focus:text-[var(--os-color-selection-text)] data-[open]:bg-[var(--os-color-selection-bg)] data-[open]:text-[var(--os-color-selection-text)] data-[state=open]:bg-[var(--os-color-selection-bg)] data-[state=open]:text-[var(--os-color-selection-text)]",
        !isSystem7Theme && !isMacOSTheme && "rounded-sm focus:bg-accent data-[open]:bg-accent data-[state=open]:bg-accent",
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
        ...(isSystem7Theme && {
          padding: "2px 12px",
          margin: "0",
        }),
        ...(isMacOSTheme && {
          borderRadius: "0px",
          padding: isAquaGlass ? "4px 10px" : "6px 12px 6px 16px",
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
    </MenubarMenuPrimitive.SubmenuTrigger>
  )
}
MenubarSubTrigger.displayName = MenubarMenuPrimitive.SubmenuTrigger.displayName

const MenubarSubContent = (
  {
    ref,
    className,
    children,
    align,
    alignOffset,
    collisionAvoidance,
    collisionBoundary,
    collisionPadding,
    positionMethod,
    side = "inline-end",
    sideOffset = 4,
    style,
    ...props
  }: React.ComponentPropsWithoutRef<typeof MenubarMenuPrimitive.Popup> & {
    ref?: React.Ref<React.ElementRef<typeof MenubarMenuPrimitive.Popup>>;
  } & Pick<
    React.ComponentPropsWithoutRef<typeof MenubarMenuPrimitive.Positioner>,
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
  const { isMacOSTheme, isAquaGlass } = useThemeFlags()
  const isMobile = useMediaQuery("(max-width: 768px)")

  return (
    <MenubarMenuPrimitive.Portal>
      <MenubarMenuPrimitive.Positioner
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
        <MenubarMenuPrimitive.Popup
          ref={ref}
          data-ryos-popper-content=""
          data-ryos-menu-content=""
          className={cn(
            // Use z-[10004] to ensure submenu content appears above menu content (z-[10003])
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
            ...style,
          }}
          render={(popupProps, state) => (
            <div
              {...popupProps}
              data-state={state.open ? "open" : "closed"}
            />
          )}
          {...props}
        >
          <MenubarMenuPrimitive.Viewport className="max-h-[inherit] overflow-y-auto">
            {children}
          </MenubarMenuPrimitive.Viewport>
        </MenubarMenuPrimitive.Popup>
      </MenubarMenuPrimitive.Positioner>
    </MenubarMenuPrimitive.Portal>
  )
}
MenubarSubContent.displayName = MenubarMenuPrimitive.Popup.displayName

const MenubarContent = (
  {
    ref,
    className,
    align = "start",
    alignOffset = 0,
    sideOffset = 8,
    side,
    collisionPadding,
    children,
    style,
    ...props
  }: React.ComponentPropsWithoutRef<typeof MenubarMenuPrimitive.Popup> &
    Pick<
      React.ComponentPropsWithoutRef<typeof MenubarMenuPrimitive.Positioner>,
      "align" | "alignOffset" | "collisionPadding" | "side" | "sideOffset"
    > & {
    ref?: React.Ref<React.ElementRef<typeof MenubarMenuPrimitive.Popup>>;
  }
) => {
  const { isMacOSTheme, isAquaGlass } = useThemeFlags()
  const isMobile = useMediaQuery("(max-width: 768px)")
  const isSwitching = React.use(MenubarSwitchingContext)
  const styleObject = typeof style === "function" ? undefined : style

  return (
    <MenubarMenuPrimitive.Portal>
      <MenubarMenuPrimitive.Positioner
        className="z-[10003]"
        align={align}
        alignOffset={alignOffset}
        sideOffset={sideOffset}
        side={side}
        collisionPadding={collisionPadding}
        data-ryos-popper-content-wrapper=""
      >
        <MenubarMenuPrimitive.Popup
          ref={ref}
          data-ryos-popper-content=""
          data-ryos-menu-content=""
          className={cn(
            // Use z-[10003] to ensure menu content appears above the menubar (z-[10002])
            // This is critical for Safari where backdrop-filter creates new stacking contexts
            "z-[10003] min-w-[12rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
            // origin-[…]: scale from the trigger side instead of the element center.
            "origin-[var(--transform-origin)]",
            // Only animate when not switching between menus. Zoom + fade only.
            !isSwitching && "data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
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
          <MenubarMenuPrimitive.Viewport className="max-h-[inherit] overflow-y-auto">
            {children}
          </MenubarMenuPrimitive.Viewport>
        </MenubarMenuPrimitive.Popup>
      </MenubarMenuPrimitive.Positioner>
    </MenubarMenuPrimitive.Portal>
  )
}
MenubarContent.displayName = MenubarMenuPrimitive.Popup.displayName

const MenubarItem = (
  {
    ref,
    className,
    inset,
    onSelect,
    onClick,
    ...props
  }: React.ComponentPropsWithoutRef<typeof MenubarMenuPrimitive.Item> & {
    inset?: boolean
    onSelect?: React.ComponentPropsWithoutRef<typeof MenubarMenuPrimitive.Item>["onClick"]
    ref?: React.Ref<React.ElementRef<typeof MenubarMenuPrimitive.Item>>
  }
) => {
  const { isWindowsTheme, isMacOSTheme, isSystem7Theme, isAquaGlass } = useThemeFlags()

  return (
    <MenubarMenuPrimitive.Item
      ref={ref}
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 px-2 py-1.5 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0",
        // Theme-specific hover/focus styles
        isSystem7Theme && "rounded-none focus:bg-[var(--os-color-selection-bg)] focus:text-[var(--os-color-selection-text)] mx-0",
        isMacOSTheme && "rounded-none focus:bg-[var(--os-color-selection-bg)] focus:text-[var(--os-color-selection-text)]",
        !isSystem7Theme && !isMacOSTheme && "rounded-sm focus:bg-accent focus:text-accent-foreground",
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
        ...(isSystem7Theme && {
          padding: "2px 12px",
          margin: "0",
        }),
        ...(isMacOSTheme && {
          borderRadius: "0px",
          padding: isAquaGlass ? "4px 10px" : "6px 20px 6px 16px",
          margin: "1px 0",
          WebkitFontSmoothing: "antialiased",
          textShadow: "0 2px 3px rgba(0, 0, 0, 0.25)",
        }),
      }}
      onClick={(event) => {
        onSelect?.(event)
        onClick?.(event)
      }}
      {...props}
    />
  )
}
MenubarItem.displayName = MenubarMenuPrimitive.Item.displayName

const MenubarCheckboxItem = (
  {
    ref,
    className,
    children,
    checked,
    onSelect,
    onClick,
    ...props
  }: React.ComponentPropsWithoutRef<typeof MenubarMenuPrimitive.CheckboxItem> & {
    onSelect?: React.ComponentPropsWithoutRef<typeof MenubarMenuPrimitive.CheckboxItem>["onClick"]
    ref?: React.Ref<React.ElementRef<typeof MenubarMenuPrimitive.CheckboxItem>>;
  }
) => {
  const {
    isWindowsTheme,
    isMacOSTheme,
    isSystem7Theme,
    isAquaMenuChrome,
  } = useThemeFlags()

  return (
    <MenubarMenuPrimitive.CheckboxItem
      ref={ref}
      className={cn(
        "relative flex cursor-default select-none items-center py-1.5 pl-8 pr-2 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        // Theme-specific hover/focus styles
        isSystem7Theme && "rounded-none focus:bg-[var(--os-color-selection-bg)] focus:text-[var(--os-color-selection-text)] hover:bg-[var(--os-color-selection-bg)] hover:text-[var(--os-color-selection-text)] mx-0",
        isMacOSTheme && "rounded-none focus:bg-[var(--os-color-selection-bg)] focus:text-[var(--os-color-selection-text)] hover:bg-[var(--os-color-selection-bg)] hover:text-[var(--os-color-selection-text)]",
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
        onSelect?.(event)
        onClick?.(event)
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
        <MenubarMenuPrimitive.CheckboxItemIndicator>
          <Check size={12} weight="bold" />
        </MenubarMenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenubarMenuPrimitive.CheckboxItem>
  )
}
MenubarCheckboxItem.displayName = MenubarMenuPrimitive.CheckboxItem.displayName

const MenubarRadioItem = (
  {
    ref,
    className,
    children,
    onSelect,
    onClick,
    ...props
  }: React.ComponentPropsWithoutRef<typeof MenubarMenuPrimitive.RadioItem> & {
    onSelect?: React.ComponentPropsWithoutRef<typeof MenubarMenuPrimitive.RadioItem>["onClick"]
    ref?: React.Ref<React.ElementRef<typeof MenubarMenuPrimitive.RadioItem>>;
  }
) => {
  const {
    isWindowsTheme,
    isMacOSTheme,
    isSystem7Theme,
    isAquaMenuChrome,
  } = useThemeFlags()

  return (
    <MenubarMenuPrimitive.RadioItem
      ref={ref}
      className={cn(
        "relative flex cursor-default select-none items-center py-1.5 pl-8 pr-2 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        // Theme-specific hover/focus styles
        isSystem7Theme && "rounded-none focus:bg-[var(--os-color-selection-bg)] focus:text-[var(--os-color-selection-text)] hover:bg-[var(--os-color-selection-bg)] hover:text-[var(--os-color-selection-text)] mx-0",
        isMacOSTheme && "rounded-none focus:bg-[var(--os-color-selection-bg)] focus:text-[var(--os-color-selection-text)] hover:bg-[var(--os-color-selection-bg)] hover:text-[var(--os-color-selection-text)]",
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
      onClick={(event) => {
        onSelect?.(event)
        onClick?.(event)
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
        <MenubarMenuPrimitive.RadioItemIndicator>
          <Circle size={6} weight="fill" />
        </MenubarMenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenubarMenuPrimitive.RadioItem>
  )
}
MenubarRadioItem.displayName = MenubarMenuPrimitive.RadioItem.displayName

const MenubarLabel = (
  {
    ref,
    className,
    inset,
    ...props
  }: React.ComponentPropsWithoutRef<typeof MenubarMenuPrimitive.GroupLabel> & {
    inset?: boolean
    ref?: React.Ref<React.ElementRef<typeof MenubarMenuPrimitive.GroupLabel>>
  }
) => {
  const { isWindowsTheme, isMacOSTheme } = useThemeFlags()

  return (
    <MenubarMenuPrimitive.GroupLabel
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
  )
}
MenubarLabel.displayName = MenubarMenuPrimitive.GroupLabel.displayName

const MenubarSeparator = (
  {
    ref,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof MenubarMenuPrimitive.Separator> & {
    ref?: React.Ref<React.ElementRef<typeof MenubarMenuPrimitive.Separator>>;
  }
) => {
  const { isSystem7Theme, isMacOSTheme } = useThemeFlags()

  return (
    <MenubarMenuPrimitive.Separator
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
  )
}
MenubarSeparator.displayName = MenubarMenuPrimitive.Separator.displayName

const MenubarShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}
MenubarShortcut.displayName = "MenubarShortcut"

export {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarLabel,
  MenubarCheckboxItem,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarPortal,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarGroup,
  MenubarSub,
  MenubarShortcut,
}
