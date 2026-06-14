import * as React from "react";
import { Slider as SliderPrimitive } from "@base-ui/react/slider";

import { cn } from "@/lib/utils";

type SliderProps = React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
  onValueCommit?: React.ComponentPropsWithoutRef<
    typeof SliderPrimitive.Root
  >["onValueCommitted"];
};

const Slider = (
  {
    ref,
    className,
    onValueCommit,
    onValueCommitted,
    ...props
  }: SliderProps & {
    ref?: React.Ref<React.ElementRef<typeof SliderPrimitive.Root>>;
  }
) => (<SliderPrimitive.Root
  ref={ref}
  className={cn(
    "os-slider relative touch-none select-none",
    props.orientation === "vertical"
      ? "h-full w-auto"
      : "w-full",
    className
  )}
  onValueCommitted={(value, eventDetails) => {
    onValueCommitted?.(value, eventDetails);
    onValueCommit?.(value, eventDetails);
  }}
  {...props}
>
  <SliderPrimitive.Control
    className={cn(
      "flex h-full w-full touch-none select-none items-center",
      props.orientation === "vertical"
        ? "flex-col"
        : "items-center"
    )}
  >
    <SliderPrimitive.Track
      className={cn(
        "os-slider-track relative grow overflow-hidden bg-primary/20",
        props.orientation === "vertical" ? "h-full w-1.5" : "h-1.5 w-full"
      )}
    >
      <SliderPrimitive.Indicator
        className={cn(
          "os-slider-range absolute bg-primary",
          props.orientation === "vertical" ? "w-full" : "h-full"
        )}
      />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="os-slider-thumb block size-4 border-2 border-primary bg-background shadow-[1px_1px_0px_0px_rgba(0,0,0,0.3)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[disabled]:pointer-events-none data-[disabled]:opacity-50" />
  </SliderPrimitive.Control>
</SliderPrimitive.Root>);
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
