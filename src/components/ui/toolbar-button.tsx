import * as React from "react";
import { cn } from "@/lib/utils";

interface ToolbarButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: boolean;
}

export const ToolbarButton = (
  {
    ref,
    className,
    icon = false,
    children,
    ...props
  }: ToolbarButtonProps & {
    ref: React.RefObject<HTMLButtonElement>;
  }
) => (<button
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
</button>);
ToolbarButton.displayName = "ToolbarButton";

interface ToolbarButtonGroupProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const ToolbarButtonGroup = (
  {
    ref,
    className,
    children,
    ...props
  }: ToolbarButtonGroupProps & {
    ref: React.RefObject<HTMLDivElement>;
  }
) => (<div
  ref={ref}
  className={cn("metal-inset-btn-group", className)}
  {...props}
>
  {children}
</div>);
ToolbarButtonGroup.displayName = "ToolbarButtonGroup";
