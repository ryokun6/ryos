import * as React from "react";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { useSound, Sounds } from "@/hooks/useSound";

import { cn } from "@/lib/utils";

const Tabs = (
  {
    ref,
    ...props
  }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> & {
    ref?: React.Ref<React.ElementRef<typeof TabsPrimitive.Root>>;
  }
) => (
  <TabsPrimitive.Root
    ref={ref}
    render={(rootProps) => (
      <div {...rootProps} data-ryos-tabs-root="" />
    )}
    {...props}
  />
);
Tabs.displayName = "Tabs";

const TabsList = (
  {
    ref,
    className,
    asChild = false,
    children,
    ...props
  }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
    asChild?: boolean;
    ref?: React.Ref<React.ElementRef<typeof TabsPrimitive.List>>;
  }
) => (<TabsPrimitive.List
  ref={ref}
  className={cn(
    "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
    className
  )}
  render={asChild && React.isValidElement(children) ? children : undefined}
  {...props}
>
  {asChild ? null : children}
</TabsPrimitive.List>);
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = (
  {
    ref,
    className,
    onClick,
    ...props
  }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Tab> & {
    ref?: React.Ref<React.ElementRef<typeof TabsPrimitive.Tab>>;
  }
) => {
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);

  const handleClick: React.ComponentPropsWithoutRef<
    typeof TabsPrimitive.Tab
  >["onClick"] = (event) => {
    playClick();
    onClick?.(event);
  };

  return (
    <TabsPrimitive.Tab
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
        className
      )}
      onClick={handleClick}
      render={(triggerProps, state) => (
        <button
          {...triggerProps}
          data-state={state.active ? "active" : "inactive"}
        />
      )}
      {...props}
    />
  );
};
TabsTrigger.displayName = TabsPrimitive.Tab.displayName;

const TabsContent = (
  {
    ref,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Panel> & {
    ref?: React.Ref<React.ElementRef<typeof TabsPrimitive.Panel>>;
  }
) => (<TabsPrimitive.Panel
  ref={ref}
  className={cn(
    "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    className
  )}
  render={(contentProps, state) => (
    <div
      {...contentProps}
      data-state={state.hidden ? "inactive" : "active"}
    />
  )}
  {...props}
/>);
TabsContent.displayName = TabsPrimitive.Panel.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
