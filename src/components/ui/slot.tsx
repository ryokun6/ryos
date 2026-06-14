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
    const childProps = child.props;

    return React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
      ...props,
      ...childProps,
      ref,
      className: cn(className, childProps.className),
      style: { ...style, ...childProps.style },
      onClick: composeEventHandlers(
        onClick as React.MouseEventHandler<HTMLElement>,
        childProps.onClick as React.MouseEventHandler<HTMLElement>
      ),
    } as Record<string, unknown>);
  }
);
Slot.displayName = "Slot";

export { Slot };
