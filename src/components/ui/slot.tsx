import * as React from "react";
import { cn } from "@/lib/utils";

type SlotProps = React.HTMLAttributes<HTMLElement> & {
  children?: React.ReactNode;
};

function composeEventHandlers<E extends React.SyntheticEvent>(
  ours?: (event: E) => void,
  theirs?: (event: E) => void
) {
  return (event: E) => {
    theirs?.(event);
    if (!event.defaultPrevented) {
      ours?.(event);
    }
  };
}

const Slot = React.forwardRef<HTMLElement, SlotProps>(
  ({ children, className, style, onClick, ...props }, ref) => {
    if (!React.isValidElement(children)) {
      return null;
    }

    const child = children as React.ReactElement<SlotProps>;

    return React.cloneElement(child, {
      ...props,
      ...child.props,
      ref,
      className: cn(className, child.props.className),
      style: { ...style, ...child.props.style },
      onClick: composeEventHandlers(
        onClick as React.MouseEventHandler<HTMLElement>,
        child.props.onClick as React.MouseEventHandler<HTMLElement>
      ),
    });
  }
);
Slot.displayName = "Slot";

export { Slot };
