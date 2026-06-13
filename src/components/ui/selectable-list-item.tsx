import * as React from "react";
import { cn } from "@/lib/utils";

interface SelectableListItemProps
  extends React.HTMLAttributes<HTMLDivElement> {
  isSelected: boolean;
  children: React.ReactNode;
  className?: string;
}

export const SelectableListItem = (
  {
    ref,
    isSelected,
    children,
    className,
    ...props
  }: SelectableListItemProps & {
    ref?: React.Ref<HTMLDivElement>;
  }
) => (<div
  ref={ref}
  className={cn(
    "os-app-sidebar-item py-1 px-5 cursor-pointer",
    !isSelected && "hover:bg-black/5 os-mac-aqua-dark:hover:bg-white/8",
    className
  )}
  data-selected={isSelected ? "true" : undefined}
  {...props}
>
  {children}
</div>);
SelectableListItem.displayName = "SelectableListItem";
