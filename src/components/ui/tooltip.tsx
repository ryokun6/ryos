import * as React from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { cn } from "@/lib/utils";

const TooltipProvider = ({
  delayDuration,
  skipDelayDuration,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider> & {
  delayDuration?: number;
  skipDelayDuration?: number;
}) => (
  <TooltipPrimitive.Provider
    delay={delayDuration ?? props.delay}
    timeout={skipDelayDuration ?? props.timeout}
    {...props}
  />
);

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = ({
  asChild = false,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger> & {
  asChild?: boolean;
}) => (
  <TooltipPrimitive.Trigger
    render={asChild && React.isValidElement(children) ? children : undefined}
    {...props}
  >
    {asChild ? null : children}
  </TooltipPrimitive.Trigger>
);

const TooltipContent = (
  {
    ref,
    className,
    sideOffset = 4,
    side,
    align,
    ...props
  }: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Popup> &
    Pick<
      React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Positioner>,
      "sideOffset" | "side" | "align"
    > & {
    ref?: React.Ref<React.ElementRef<typeof TooltipPrimitive.Popup>>;
  }
) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Positioner
      sideOffset={sideOffset}
      side={side}
      align={align}
    >
      <TooltipPrimitive.Popup
        ref={ref}
        className={cn(
          "z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 font-geneva-12 text-[12px]",
          className
        )}
        {...props}
      />
    </TooltipPrimitive.Positioner>
  </TooltipPrimitive.Portal>
);
TooltipContent.displayName = TooltipPrimitive.Popup.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
