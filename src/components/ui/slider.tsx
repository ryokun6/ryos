import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

const Slider = (
  {
    ref,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
    ref?: React.Ref<React.ElementRef<typeof SliderPrimitive.Root>>;
  }
) => (<SliderPrimitive.Root
  ref={ref}
  className={cn(
    "os-slider relative flex touch-none select-none items-center",
    props.orientation === "vertical"
      ? "h-full w-auto flex-col"
      : "w-full items-center",
    className
  )}
  {...props}
>
  <SliderPrimitive.Track
    className={cn(
      "os-slider-track relative grow overflow-hidden bg-primary/20",
      props.orientation === "vertical" ? "h-full w-1.5" : "h-1.5 w-full"
    )}
  >
    <SliderPrimitive.Range
      className={cn(
        "os-slider-range absolute bg-primary",
        props.orientation === "vertical" ? "w-full" : "h-full"
      )}
    />
  </SliderPrimitive.Track>
  <SliderPrimitive.Thumb className="os-slider-thumb block h-4 w-4 border-2 border-primary bg-background shadow-[1px_1px_0px_0px_rgba(0,0,0,0.3)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
</SliderPrimitive.Root>);
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
