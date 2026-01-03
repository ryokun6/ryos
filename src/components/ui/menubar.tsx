import * as React from "react"
import * as MenubarPrimitive from "@radix-ui/react-menubar"
import { Check, CaretRight, Circle } from "@phosphor-icons/react"
import { useSound, Sounds } from "@/hooks/useSound"
import { useThemeStore } from "@/stores/useThemeStore"
import { useMediaQuery } from "@/hooks/useMediaQuery"

import { cn } from "@/lib/utils"

// Context to track if we're switching between menus (to skip animations)
const MenubarSwitchingContext = React.createContext<boolean>(false)

const MenubarMenu = MenubarPrimitive.Menu

const MenubarGroup = MenubarPrimitive.Group

const MenubarPortal = MenubarPrimitive.Portal

const MenubarSub = MenubarPrimitive.Sub

const MenubarRadioGroup = MenubarPrimitive.RadioGroup

const Menubar = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Root>
>(({ className, onValueChange, ...props }, ref) => {
  const { play: playMenuOpen } = useSound(Sounds.MENU_OPEN)
  const { play: playMenuClose } = useSound(Sounds.MENU_CLOSE)
  const [previousValue, setPreviousValue] = React.useState<string | undefined>(undefined)
  const [isSwitching, setIsSwitching] = React.useState(false)

  const handleValueChange = (value: string) => {
    // Play sound based on menu state change
    if (value && !previousValue) {
      // Opening a menu from closed state
      playMenuOpen()
      setIsSwitching(false)
    } else if (!value && previousValue) {
      // Closing a menu completely
      playMenuClose()
      setIsSwitching(false)
    } else if (value && previousValue && value !== previousValue) {
      // Switching between menus - skip sound and animation for instant swap
      setIsSwitching(true)
    }
    setPreviousValue(value)
    onValueChange?.(value)
  }

  return (
    <MenubarSwitchingContext.Provider value={isSwitching}>
      <MenubarPrimitive.Root
        ref={ref}
        className={cn(
          "flex items-center space-x-1 rounded-md p-1",
          className
        )}
        onValueChange={handleValueChange}
        {...props}
      />
    </MenubarSwitchingContext.Provider>
  )
})
Menubar.displayName = MenubarPrimitive.Root.displayName

const MenubarTrigger = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Trigger>
>(({ className, style, ...props }, ref) => {
  const currentTheme = useThemeStore((state) => state.current)
  const isWindowsTheme = currentTheme === "xp" || currentTheme === "win98"
  const isSystem7 = currentTheme === "system7"
  const isMacOSX = currentTheme === "macosx"

  // Theme-specific styles for the trigger
  const themeStyles: React.CSSProperties = {
    ...(isMacOSX && {
      textShadow: "0 2px 3px rgba(0, 0, 0, 0.25)",
    }),
  }

  // Theme-specific classes
  const themeClasses = cn(
    // Base styles - h-full + self-stretch ensures trigger fills parent height (works with both CSS var and Tauri's 32px)
    "flex cursor-default select-none items-center h-full self-stretch px-2 text-md font-medium outline-none",
    // Windows themes: plain text style, no background changes, add menubar-trigger class for CSS override
    isWindowsTheme && "rounded-none menubar-trigger",
    // System 7: black background, white text when open
    // Explicitly clear state when closed to prevent lingering styles (overrides focus states)
    isSystem7 && "rounded-none data-[state=open]:bg-black data-[state=open]:text-white data-[state=closed]:!bg-transparent data-[state=closed]:!text-inherit",
    // macOS X: blue background (matches menu selection color), white text when open
    // Explicitly clear state when closed to prevent lingering styles (use !important to override focus states)
    isMacOSX && "rounded-none data-[state=open]:bg-[rgba(39,101,202,0.88)] data-[state=open]:text-white data-[state=closed]:!bg-transparent data-[state=closed]:!text-inherit",
    // Default/other themes
    !isWindowsTheme && !isSystem7 && !isMacOSX && "rounded-sm data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
    className
  )

  return (
    <MenubarPrimitive.Trigger
      ref={ref}
      className={themeClasses}
      style={{ ...themeStyles, ...style }}
      {...props}
    />
  )
})
MenubarTrigger.displayName = MenubarPrimitive.Trigger.displayName

const MenubarSubTrigger = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.SubTrigger> & {
    inset?: boolean
  }
>(({ className, inset, children, ...props }, ref) => {
  const currentTheme = useThemeStore((state) => state.current)
  const isMacOSTheme = currentTheme === "macosx"
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98"
  const isSystem7 = currentTheme === "system7"

  return (
    <MenubarPrimitive.SubTrigger
      ref={ref}
      className={cn(
        "flex cursor-default gap-2 select-none items-center px-2 py-1.5 text-sm outline-none [&_svg]:pointer-events-none [&_svg]:shrink-0",
        // Theme-specific hover/focus styles
        isSystem7 && "rounded-none focus:bg-black focus:text-white data-[state=open]:bg-black data-[state=open]:text-white mx-0",
        isMacOSTheme && "rounded-none focus:bg-[rgba(39,101,202,0.88)] focus:text-white data-[state=open]:bg-[rgba(39,101,202,0.88)] data-[state=open]:text-white",
        !isSystem7 && !isMacOSTheme && "rounded-sm focus:bg-accent data-[state=open]:bg-accent",
        inset && "pl-8",
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
          ? "12px !important"
          : undefined,
        ...(isSystem7 && {
          padding: "2px 12px",
          margin: "0",
        }),
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
    </MenubarPrimitive.SubTrigger>
  )
})
MenubarSubTrigger.displayName = MenubarPrimitive.SubTrigger.displayName

const MenubarSubContent = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.SubContent>
>(({ className, style, ...props }, ref) => {
  const currentTheme = useThemeStore((state) => state.current)
  const isMacOSTheme = currentTheme === "macosx"
  const isMobile = useMediaQuery("(max-width: 768px)")

  return (
    <MenubarPrimitive.Portal>
      <MenubarPrimitive.SubContent
        ref={ref}
        className={cn(
          // Use z-[10004] to ensure submenu content appears above menu content (z-[10003])
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
    </MenubarPrimitive.Portal>
  )
})
MenubarSubContent.displayName = MenubarPrimitive.SubContent.displayName

const MenubarContent = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Content>
>(
  (
    { className, align = "start", alignOffset = 0, sideOffset = 8, style, ...props },
    ref
  ) => {
    const currentTheme = useThemeStore((state) => state.current)
    const isMacOSTheme = currentTheme === "macosx"
    const isMobile = useMediaQuery("(max-width: 768px)")
    const isSwitching = React.useContext(MenubarSwitchingContext)

    return (
      <MenubarPrimitive.Portal>
        <MenubarPrimitive.Content
          ref={ref}
          align={align}
          alignOffset={alignOffset}
          sideOffset={sideOffset}
          className={cn(
            // Use z-[10003] to ensure menu content appears above the menubar (z-[10002])
            // This is critical for Safari where backdrop-filter creates new stacking contexts
            "z-[10003] min-w-[12rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
            // Only animate when not switching between menus
            !isSwitching && "data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
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
      </MenubarPrimitive.Portal>
    )
  }
)
MenubarContent.displayName = MenubarPrimitive.Content.displayName

const MenubarItem = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Item> & {
    inset?: boolean
  }
>(({ className, inset, ...props }, ref) => {
  const currentTheme = useThemeStore((state) => state.current)
  const isMacOSTheme = currentTheme === "macosx"
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98"
  const isSystem7 = currentTheme === "system7"

  return (
    <MenubarPrimitive.Item
      ref={ref}
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 px-2 py-1.5 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0",
        // Theme-specific hover/focus styles
        isSystem7 && "rounded-none focus:bg-black focus:text-white mx-0",
        isMacOSTheme && "rounded-none focus:bg-[rgba(39,101,202,0.88)] focus:text-white",
        !isSystem7 && !isMacOSTheme && "rounded-sm focus:bg-accent focus:text-accent-foreground",
        inset && "pl-8",
        className,
        "data-[state=checked]:!bg-transparent data-[state=checked]:text-foreground"
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
        ...(isSystem7 && {
          padding: "2px 12px",
          margin: "0",
        }),
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
  )
})
MenubarItem.displayName = MenubarPrimitive.Item.displayName

const MenubarCheckboxItem = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => {
  const currentTheme = useThemeStore((state) => state.current)
  const isMacOSTheme = currentTheme === "macosx"
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98"
  const isSystem7 = currentTheme === "system7"

  return (
    <MenubarPrimitive.CheckboxItem
      ref={ref}
      className={cn(
        "relative flex cursor-default select-none items-center py-1.5 pl-8 pr-2 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        // Theme-specific hover/focus styles
        isSystem7 && "rounded-none focus:bg-black focus:text-white hover:bg-black hover:text-white mx-0",
        isMacOSTheme && "rounded-none focus:bg-[rgba(39,101,202,0.88)] focus:text-white hover:bg-[rgba(39,101,202,0.88)] hover:text-white",
        !isSystem7 && !isMacOSTheme && "rounded-sm focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground",
        className,
        "data-[state=checked]:text-foreground"
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
        ...(isSystem7 && {
          padding: "2px 12px 2px 32px",
          margin: "0",
        }),
        ...(isXpTheme && {
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
        <MenubarPrimitive.ItemIndicator>
          <Check size={12} weight="bold" />
        </MenubarPrimitive.ItemIndicator>
      </span>
      {children}
    </MenubarPrimitive.CheckboxItem>
  )
})
MenubarCheckboxItem.displayName = MenubarPrimitive.CheckboxItem.displayName

const MenubarRadioItem = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => {
  const currentTheme = useThemeStore((state) => state.current)
  const isMacOSTheme = currentTheme === "macosx"
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98"
  const isSystem7 = currentTheme === "system7"

  return (
    <MenubarPrimitive.RadioItem
      ref={ref}
      className={cn(
        "relative flex cursor-default select-none items-center py-1.5 pl-8 pr-2 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        // Theme-specific hover/focus styles
        isSystem7 && "rounded-none focus:bg-black focus:text-white hover:bg-black hover:text-white mx-0",
        isMacOSTheme && "rounded-none focus:bg-[rgba(39,101,202,0.88)] focus:text-white hover:bg-[rgba(39,101,202,0.88)] hover:text-white",
        !isSystem7 && !isMacOSTheme && "rounded-sm focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground",
        className,
        "data-[state=checked]:text-foreground"
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
        ...(isSystem7 && {
          padding: "2px 12px 2px 32px",
          margin: "0",
        }),
        ...(isXpTheme && {
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
      {...props}
    >
      <span className="absolute left-3 flex h-3.5 w-3.5 items-center justify-center">
        <MenubarPrimitive.ItemIndicator>
          <Circle size={6} weight="fill" />
        </MenubarPrimitive.ItemIndicator>
      </span>
      {children}
    </MenubarPrimitive.RadioItem>
  )
})
MenubarRadioItem.displayName = MenubarPrimitive.RadioItem.displayName

const MenubarLabel = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Label> & {
    inset?: boolean
  }
>(({ className, inset, ...props }, ref) => {
  const currentTheme = useThemeStore((state) => state.current)

  return (
    <MenubarPrimitive.Label
      ref={ref}
      className={cn(
        "px-2 py-1.5 text-sm font-semibold",
        inset && "pl-8",
        className
      )}
      style={{
        fontFamily:
          currentTheme === "xp" || currentTheme === "win98"
            ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
            : currentTheme === "macosx"
            ? '"LucidaGrande", "Lucida Grande", "AquaKana", "Hiragino Sans", "Hiragino Sans GB", "Heiti SC", "Lucida Sans Unicode", sans-serif'
            : undefined,
        fontSize:
          currentTheme === "xp" || currentTheme === "win98"
            ? "11px"
            : undefined,
      }}
      {...props}
    />
  )
})
MenubarLabel.displayName = MenubarPrimitive.Label.displayName

const MenubarSeparator = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof MenubarPrimitive.Separator>
>(({ className, ...props }, ref) => {
  const currentTheme = useThemeStore((state) => state.current)
  const isSystem7 = currentTheme === "system7"
  const isMacOSTheme = currentTheme === "macosx"

  return (
    <MenubarPrimitive.Separator
      ref={ref}
      className={cn(
        className,
        "-mx-1 my-1 h-[1px] border-b-0",
        !isMacOSTheme && "border-t border-muted",
        isSystem7 && "border-dotted",
        !isSystem7 && !isMacOSTheme && "border-solid"
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
})
MenubarSeparator.displayName = MenubarPrimitive.Separator.displayName

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
