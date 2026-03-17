import * as React from "react";
import { cn } from "@/lib/utils";

interface ToolbarButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: boolean;
}

export const ToolbarButton = React.forwardRef<
  HTMLButtonElement,
  ToolbarButtonProps
>(({ className, icon = false, children, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      "metal-inset-btn",
      icon && "metal-inset-icon",
      className
    )}
    {...props}
  >
    {children}
  </button>
));
ToolbarButton.displayName = "ToolbarButton";

interface ToolbarButtonGroupProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const ToolbarButtonGroup = React.forwardRef<
  HTMLDivElement,
  ToolbarButtonGroupProps
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("metal-inset-btn-group", className)}
    {...props}
  >
    {children}
  </div>
));
ToolbarButtonGroup.displayName = "ToolbarButtonGroup";
