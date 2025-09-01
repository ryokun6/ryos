// Enhanced Button Component for ryOS Design System
// Demonstrates improved design system with better variants, animations, and theme support

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { useSound, Sounds } from "@/hooks/useSound";
import { designSystem } from "@/lib/design-system";

import { cn } from "@/lib/utils";

const enhancedButtonVariants = cva(
  designSystem.components.button.base,
  {
    variants: {
      variant: {
        default: designSystem.components.button.default,
        destructive: designSystem.components.button.destructive,
        outline: designSystem.components.button.outline,
        secondary: designSystem.components.button.secondary,
        ghost: designSystem.components.button.ghost,
        link: designSystem.components.button.link,
        retro: designSystem.components.button.retro,
        player: designSystem.components.button.player,
        // New enhanced variants
        gradient: "bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all duration-300",
        neon: "bg-black text-cyan-400 border border-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)] hover:shadow-[0_0_20px_rgba(34,211,238,0.8)] transition-all duration-300",
        glass: "bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 transition-all duration-300",
        pixel: "bg-black text-white border-2 border-white font-mondwest hover:bg-white hover:text-black transition-all duration-150",
        crt: "bg-green-900 text-green-100 border border-green-700 font-mondwest hover:bg-green-800 shadow-[0_0_10px_rgba(34,197,94,0.3)] transition-all duration-300",
      },
      size: {
        xs: "h-6 px-2 text-xs",
        sm: "h-8 px-3 text-sm",
        default: "h-9 px-4 py-2",
        lg: "h-10 px-8",
        xl: "h-12 px-10 text-lg",
        icon: "h-9 w-9",
        "icon-sm": "h-6 w-6",
        "icon-lg": "h-12 w-12",
      },
      animation: {
        none: "",
        pulse: "animate-pulse",
        bounce: "animate-bounce",
        spin: "animate-spin",
        ping: "animate-ping",
        shake: designSystem.animations.animateShake,
        shimmer: designSystem.animations.animateShimmer,
      },
      rounded: {
        none: "rounded-none",
        sm: "rounded-sm",
        md: "rounded-md",
        lg: "rounded-lg",
        xl: "rounded-xl",
        full: "rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      animation: "none",
      rounded: "md",
    },
  }
);

export interface EnhancedButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof enhancedButtonVariants> {
  asChild?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  ripple?: boolean;
}

const EnhancedButton = React.forwardRef<HTMLButtonElement, EnhancedButtonProps>(
  ({ 
    className, 
    variant, 
    size, 
    animation,
    rounded,
    asChild = false, 
    loading = false,
    icon,
    iconPosition = "left",
    ripple = true,
    disabled,
    children,
    ...props 
  }, ref) => {
    const { play: playButtonClick } = useSound(Sounds.BUTTON_CLICK);
    const Comp = asChild ? Slot : "button";
    const isDisabled = disabled || loading;

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (isDisabled) return;
      
      playButtonClick();
      
      // Ripple effect
      if (ripple && !asChild) {
        const button = e.currentTarget;
        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;
        
        const ripple = document.createElement("span");
        ripple.style.width = ripple.style.height = size + "px";
        ripple.style.left = x + "px";
        ripple.style.top = y + "px";
        ripple.classList.add("absolute", "bg-white/20", "rounded-full", "scale-0", "animate-ping");
        
        button.appendChild(ripple);
        
        setTimeout(() => {
          ripple.remove();
        }, 600);
      }
      
      props.onClick?.(e);
    };

    const content = (
      <>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <div className={cn("flex items-center gap-2", loading && "opacity-0")}>
          {icon && iconPosition === "left" && icon}
          {children}
          {icon && iconPosition === "right" && icon}
        </div>
      </>
    );

    return (
      <Comp
        className={cn(
          enhancedButtonVariants({ variant, size, animation, rounded, className }),
          "relative overflow-hidden",
          isDisabled && "cursor-not-allowed opacity-50"
        )}
        ref={ref}
        disabled={isDisabled}
        {...props}
        onClick={handleClick}
      >
        {content}
      </Comp>
    );
  }
);

EnhancedButton.displayName = "EnhancedButton";

export { EnhancedButton, enhancedButtonVariants };

// Button Group Component
interface ButtonGroupProps {
  children: React.ReactNode;
  orientation?: "horizontal" | "vertical";
  size?: VariantProps<typeof enhancedButtonVariants>["size"];
  variant?: VariantProps<typeof enhancedButtonVariants>["variant"];
  className?: string;
}

export const ButtonGroup: React.FC<ButtonGroupProps> = ({
  children,
  orientation = "horizontal",
  size,
  variant,
  className,
}) => {
  return (
    <div
      className={cn(
        "inline-flex",
        orientation === "horizontal" ? "flex-row" : "flex-col",
        className
      )}
    >
      {React.Children.map(children, (child, index) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, {
            ...child.props,
            size: size || child.props.size,
            variant: variant || child.props.variant,
            className: cn(
              child.props.className,
              orientation === "horizontal" && index > 0 && "-ml-px rounded-l-none",
              orientation === "horizontal" && index < React.Children.count(children) - 1 && "rounded-r-none",
              orientation === "vertical" && index > 0 && "-mt-px rounded-t-none",
              orientation === "vertical" && index < React.Children.count(children) - 1 && "rounded-b-none"
            ),
          });
        }
        return child;
      })}
    </div>
  );
};