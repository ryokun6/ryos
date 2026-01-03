import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { useSound, Sounds } from "@/hooks/useSound";

import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/useThemeStore";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground  hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        retro:
          "border-[5px] border-solid border-transparent [border-image:url('/assets/button.svg')_30_stretch] active:[border-image:url('/assets/button-default.svg')_60_stretch] focus:[border-image:url('/assets/button-default.svg')_60_stretch] shadow-none focus:outline-none focus:ring-0",
        aqua: "aqua-button secondary text-sm h-auto px-4 py-2 min-w-0 transform-none m-0",
        player:
          "text-[9px] flex items-center justify-center focus:outline-none relative min-w-[45px] h-[20px] border border-solid border-transparent [border-image:url('/assets/videos/switch.png')_1_fill] [border-image-slice:1] bg-none font-geneva-12 text-black hover:brightness-90 active:brightness-50 [&[data-state=on]]:brightness-60",
        aqua_select:
          "text-sm h-[24px] px-2 py-1 min-w-[60px] inline-flex items-center justify-between",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const { play: playButtonClick } = useSound(Sounds.BUTTON_CLICK);
    const Comp = asChild ? Slot : "button";
    const currentTheme = useThemeStore((state) => state.current);
    const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
    const isMacTheme = currentTheme === "macosx";

    const [isFocused, setIsFocused] = React.useState(false);
    const [isPressed, setIsPressed] = React.useState(false);

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      playButtonClick();
      props.onClick?.(e);
    };

    // For macOS theme, use aqua variant for default buttons
    if (isMacTheme && variant === "default") {
      return (
        <Comp
          className={cn("aqua-button primary", className)}
          ref={ref}
          style={{ position: "relative", zIndex: 1, ...props.style }}
          {...props}
          onClick={handleClick}
        />
      );
    }

    // For macOS theme with secondary variant, use aqua secondary
    if (isMacTheme && variant === "secondary") {
      return (
        <Comp
          className={cn("aqua-button secondary", className)}
          ref={ref}
          style={{ position: "relative", zIndex: 1, ...props.style }}
          {...props}
          onClick={handleClick}
        />
      );
    }

    // For macOS theme with retro variant, use aqua primary
    if (isMacTheme && variant === "retro") {
      return (
        <Comp
          className={cn("aqua-button secondary", className)}
          ref={ref}
          style={{ position: "relative", zIndex: 1, ...props.style }}
          {...props}
          onClick={handleClick}
        />
      );
    }

    // macOS Aqua Select-look variant (matches macOS select trigger styling)
    if (isMacTheme && variant === "aqua_select") {
      const dataState = (props as Record<string, unknown>)["data-state"];
      const ariaPressed = (props as Record<string, unknown>)["aria-pressed"];
      const isActiveSelected = dataState === "on" || ariaPressed === true;
      return (
        <Comp
          className={cn(
            "macos-select-trigger no-chevron aqua-select-btn inline-flex w-auto items-center justify-center whitespace-nowrap rounded px-2 py-1 text-sm gap-0",
            isActiveSelected && "aqua-selected",
            className
          )}
          ref={ref}
          style={{
            position: "relative",
            zIndex: 1,
            height: "22px",
            lineHeight: 1.5,
            minWidth: "60px",
            overflow: "hidden",
            cursor: "default",
            border: "none",
            boxSizing: "border-box",
            WebkitFontSmoothing: "antialiased",
            background: isPressed
              ? "linear-gradient(#9e9e9e, #cbcbcb)"
              : isActiveSelected
              ? "linear-gradient(rgb(145 153 156 / 91%), rgb(184 188 192 / 80%))"
              : "linear-gradient(rgba(160, 160, 160, 0.625), rgba(255, 255, 255, 0.625))",
            boxShadow: isPressed
              ? "inset 0 1px 2px rgba(0, 0, 0, 0.35), inset 0 1px 1px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.25)"
              : isFocused
              ? "0 2px 3px rgba(0, 0, 0, 0.2), 0 1px 1px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.3), 0 0 3px var(--os-color-selection-glow)"
              : isActiveSelected
              ? "0 2px 3px rgba(0,0,0,0.22), 0 1px 1px rgba(0,0,0,0.32), 0 0 0 1px rgba(0,0,0,0.42)"
              : "0 2px 3px rgba(0, 0, 0, 0.2), 0 1px 1px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.3)",
            color: "black",
            textShadow: "0 2px 3px rgba(0, 0, 0, 0.25)",
            paddingRight: "8px",
            paddingLeft: "8px",
            fontSize: "13px",
            ...(props.style as React.CSSProperties),
          }}
          onClick={handleClick}
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
        />
      );
    }

    // For XP/Win98 themes, use xp.css button class only for default variant
    // Ghost variant should maintain its clean appearance for menubars
    if (isXpTheme && variant === "default") {
      return (
        <Comp
          className={cn("button", className)}
          ref={ref}
          {...props}
          onClick={handleClick}
        />
      );
    }

    // XP/Win98 fallback for aqua-select: use classic button
    if (isXpTheme && variant === "aqua_select") {
      return (
        <Comp
          className={cn("button", className)}
          ref={ref}
          {...props}
          onClick={handleClick}
        />
      );
    }

    // For XP/Win98 themes with ghost variant, add specific classes to override global button styles
    if (isXpTheme && variant === "ghost") {
      return (
        <Comp
          className={cn(
            buttonVariants({ variant, size }),
            "!border-none !bg-transparent !shadow-none !box-shadow-none !background-none",
            "[background:transparent!important] [box-shadow:none!important] [border:none!important]",
            className
          )}
          ref={ref}
          {...props}
          onClick={handleClick}
        />
      );
    }

    // For macOS theme with ghost variant, maintain clean appearance for menubars
    if (isMacTheme && variant === "ghost") {
      return (
        <Comp
          className={cn(
            buttonVariants({ variant, size }),
            "!border-none !bg-transparent !shadow-none !box-shadow-none !background-none",
            "[background:transparent!important] [box-shadow:none!important] [border:none!important]",
            className
          )}
          ref={ref}
          {...props}
          onClick={handleClick}
        />
      );
    }

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
        onClick={handleClick}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
