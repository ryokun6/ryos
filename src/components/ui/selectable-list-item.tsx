import * as React from "react";
import { cn } from "@/lib/utils";

interface SelectableListItemProps
  extends React.HTMLAttributes<HTMLDivElement> {
  isSelected: boolean;
  children: React.ReactNode;
  className?: string;
}

export const SelectableListItem = React.forwardRef<
  HTMLDivElement,
  SelectableListItemProps
>(({ isSelected, children, className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "py-1 px-5 cursor-pointer",
      !isSelected && "hover:bg-black/5",
      className
    )}
    data-selected={isSelected ? "true" : undefined}
    {...props}
  >
    {children}
  </div>
));
SelectableListItem.displayName = "SelectableListItem";
