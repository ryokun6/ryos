import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { useSound, Sounds } from "@/hooks/useSound";

import { cn } from "@/lib/utils";
import { useThemeFlags } from "@/hooks/useThemeFlags";

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

const Button = (
  {
    ref,
    className,
    variant,
    size,
    asChild = false,
    ...props
  }: ButtonProps & {
    ref?: React.Ref<HTMLButtonElement>;
  }
) => {
  const { play: playButtonClick } = useSound(Sounds.BUTTON_CLICK);
  const Comp = asChild ? Slot : "button";
  const { isXpTheme, isMacOSTheme } = useThemeFlags();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    playButtonClick();
    props.onClick?.(e);
  };

  const resolvedClassName = (() => {
    // macOS: default/secondary/retro → aqua-button
    if (isMacOSTheme && variant === "default") return cn("aqua-button primary", className);
    if (isMacOSTheme && variant === "secondary") return cn("aqua-button secondary", className);
    if (isMacOSTheme && variant === "retro") return cn("aqua-button secondary", className);

    // macOS: aqua_select → CSS-driven aqua select button
    if (isMacOSTheme && variant === "aqua_select") {
      const dataState = (props as Record<string, unknown>)["data-state"];
      const ariaPressed = (props as Record<string, unknown>)["aria-pressed"];
      const isActiveSelected = dataState === "on" || ariaPressed === true;
      return cn(
        "macos-select-trigger no-chevron aqua-select-btn os-btn-aqua-select inline-flex w-auto items-center justify-center whitespace-nowrap rounded px-2 py-1 text-sm gap-0",
        isActiveSelected && "aqua-selected",
        className
      );
    }

    // XP/Win98: default/aqua_select → xp.css button class
    if (isXpTheme && (variant === "default" || variant === "aqua_select")) return cn("button", className);

    // XP/Win98 + macOS: ghost → transparent reset to fight global button styles
    if ((isXpTheme || isMacOSTheme) && variant === "ghost") {
      return cn(buttonVariants({ variant, size }), "os-btn-ghost-reset", className);
    }

    return cn(buttonVariants({ variant, size, className }));
  })();

  const resolvedStyle = (() => {
    if (isMacOSTheme && (variant === "default" || variant === "secondary" || variant === "retro")) {
      return { position: "relative" as const, zIndex: 1, ...props.style };
    }
    return props.style;
  })();

  return (
    <Comp
      className={resolvedClassName}
      ref={ref}
      style={resolvedStyle}
      {...props}
      onClick={handleClick}
    />
  );
};
Button.displayName = "Button";

export { Button };
