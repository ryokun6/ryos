import * as React from "react";
import { useThemeFlags } from "@/hooks/useThemeFlags";

import { cn } from "@/lib/utils";

interface InputProps extends React.ComponentProps<"input"> {
  unstyled?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, unstyled = false, type, style, ...props }, ref) => {
    const {
      currentTheme,
      isMacOSTheme,
      isSystem7Theme,
      isWindowsTheme: isWinTheme,
    } = useThemeFlags();

    return (
      <input
        type={type}
        data-theme-input={!unstyled ? currentTheme : undefined}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          !unstyled && isMacOSTheme && "os-themed-input",
          !unstyled && isSystem7Theme && "os-themed-input-system7",
          !unstyled && isWinTheme && "os-themed-input-win",
          className
        )}
        style={style}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
