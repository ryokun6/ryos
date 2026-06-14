import * as React from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, CaretDown, CaretUp } from "@phosphor-icons/react";
import { useSound, Sounds } from "@/hooks/useSound";
import { useThemeFlags } from "@/hooks/useThemeFlags";

import { cn } from "@/lib/utils";

const SelectLabelContext = React.createContext<{
  labels: Map<string, React.ReactNode>;
  registerLabel: (value: string, label: React.ReactNode | null) => void;
} | null>(null);

function getTextLabel(node: React.ReactNode): React.ReactNode | null {
  if (typeof node === "string" || typeof node === "number") {
    return node;
  }

  if (Array.isArray(node)) {
    const parts = node
      .map(getTextLabel)
      .filter((part): part is string | number => (
        typeof part === "string" || typeof part === "number"
      ));
    return parts.length > 0 ? parts.join("") : null;
  }

  return null;
}

type SelectProps = Omit<
  React.ComponentProps<typeof SelectPrimitive.Root<string>>,
  "value" | "defaultValue" | "onValueChange"
> & {
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (value: any) => void;
};

const Select = ({
  children,
  onOpenChange,
  onValueChange,
  ...props
}: SelectProps) => {
  const { play: playMenuOpen } = useSound(Sounds.MENU_OPEN);
  const { play: playMenuClose } = useSound(Sounds.MENU_CLOSE);
  const [labels, setLabels] = React.useState<Map<string, React.ReactNode>>(
    () => new Map()
  );

  const registerLabel = React.useCallback(
    (value: string, label: React.ReactNode | null) => {
      setLabels((currentLabels) => {
        const currentLabel = currentLabels.get(value);
        if (label == null) {
          if (!currentLabels.has(value)) return currentLabels;
          const nextLabels = new Map(currentLabels);
          nextLabels.delete(value);
          return nextLabels;
        }

        if (Object.is(currentLabel, label)) return currentLabels;

        const nextLabels = new Map(currentLabels);
        nextLabels.set(value, label);
        return nextLabels;
      });
    },
    []
  );

  return (
    <SelectLabelContext.Provider value={{ labels, registerLabel }}>
      <SelectPrimitive.Root
        {...props}
        onOpenChange={(open, eventDetails) => {
          if (open) {
            playMenuOpen();
          } else {
            playMenuClose();
          }
          onOpenChange?.(open, eventDetails);
        }}
        onValueChange={(value) => {
          if (value != null) {
            onValueChange?.(value);
          }
        }}
      >
        {children}
      </SelectPrimitive.Root>
    </SelectLabelContext.Provider>
  );
};

const SelectGroup = SelectPrimitive.Group;

const SelectValue = ({
  children,
  placeholder,
  ...props
}: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Value>) => {
  const labelContext = React.use(SelectLabelContext);

  return (
    <SelectPrimitive.Value placeholder={placeholder} {...props}>
      {children ?? ((value) => (
        value == null
          ? placeholder ?? null
          : labelContext?.labels.get(String(value)) ?? String(value)
      ))}
    </SelectPrimitive.Value>
  );
};
SelectValue.displayName = "SelectValue";

const SelectTrigger = (
  {
    ref,
    className,
    children,
    ...props
  }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & {
    ref?: React.Ref<React.ElementRef<typeof SelectPrimitive.Trigger>>;
  }
) => {
  const { isMacOSTheme, isWindowsTheme: isXpTheme } = useThemeFlags();

  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        !isMacOSTheme &&
          "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm [border-image:url('/assets/button.svg')_30_stretch] active:[border-image:url('/assets/button-default.svg')_60_stretch] focus:[border-image:url('/assets/button-default.svg')_60_stretch] border-[5px] ring-offset-background placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
        isMacOSTheme &&
          "macos-select-trigger os-select-trigger-macos flex w-full items-center justify-between whitespace-nowrap px-2 py-1 text-sm placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
        className
      )}
      style={{
        fontFamily: isXpTheme ? "var(--os-font-ui)" : undefined,
        fontSize: isXpTheme ? "var(--os-menu-item-font-size)" : undefined,
        ...(isXpTheme && { color: "black" }),
      }}
      {...props}
    >
      {children}
      {!isMacOSTheme && (
        <SelectPrimitive.Icon>
          <CaretDown size={12} className="opacity-50" weight="bold" />
        </SelectPrimitive.Icon>
      )}
    </SelectPrimitive.Trigger>
  );
};
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = (
  {
    ref,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpArrow> & {
    ref?: React.Ref<React.ElementRef<typeof SelectPrimitive.ScrollUpArrow>>;
  }
) => (<SelectPrimitive.ScrollUpArrow
  ref={ref}
  className={cn(
    "flex cursor-default items-center justify-center py-1",
    className
  )}
  {...props}
>
  <CaretUp size={12} weight="bold" />
</SelectPrimitive.ScrollUpArrow>);
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpArrow.displayName;

const SelectScrollDownButton = (
  {
    ref,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownArrow> & {
    ref?: React.Ref<React.ElementRef<typeof SelectPrimitive.ScrollDownArrow>>;
  }
) => (<SelectPrimitive.ScrollDownArrow
  ref={ref}
  className={cn(
    "flex cursor-default items-center justify-center py-1",
    className
  )}
  {...props}
>
  <CaretDown size={12} weight="bold" />
</SelectPrimitive.ScrollDownArrow>);
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownArrow.displayName;

const SelectContent = (
  {
    ref,
    className,
    children,
    position = "popper",
    align,
    alignOffset,
    collisionPadding,
    side,
    sideOffset,
    ...props
  }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Popup> &
    Pick<
      React.ComponentPropsWithoutRef<typeof SelectPrimitive.Positioner>,
      "align" | "alignOffset" | "collisionPadding" | "side" | "sideOffset"
    > & {
    position?: "popper" | "item-aligned";
    ref?: React.Ref<React.ElementRef<typeof SelectPrimitive.Popup>>;
  }
) => {
  const { isMacOSTheme, isAquaGlass } = useThemeFlags();

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        className="z-[10003]"
        data-radix-popper-content-wrapper=""
        sideOffset={position === "popper" ? sideOffset ?? 4 : sideOffset}
        side={side}
        align={align}
        alignOffset={alignOffset}
        collisionPadding={collisionPadding}
        alignItemWithTrigger={position !== "popper"}
      >
        <SelectPrimitive.Popup
          ref={ref}
          data-ryos-popper-content=""
          data-radix-select-content=""
          className={cn(
            // origin-[…]: scale from the trigger side instead of the element center.
            "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md origin-[var(--transform-origin)] data-[open]:animate-in data-[closed]:animate-out data-[closed]:fill-mode-forwards data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fill-mode-forwards data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            position === "popper" &&
              "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
            className
          )}
          style={{
            ...(isMacOSTheme && {
              border: "none",
              borderRadius: "0px",
              background: "var(--os-pinstripe-window)",
              // Aqua Glass gets its translucency from the frosted background in
              // themes.css; an inline opacity would block the open/close fade.
              ...(isAquaGlass ? {} : { opacity: "0.92" }),
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
              padding: "4px 0px",
            }),
          }}
          render={(popupProps, state) => (
            <div
              {...popupProps}
              data-state={state.open ? "open" : "closed"}
            />
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List
            data-ryos-select-list=""
            className={cn(
              "p-1",
              position === "popper" &&
                "w-full min-w-[var(--anchor-width)]",
              isMacOSTheme && "p-0"
            )}
          >
            {children}
          </SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
};
SelectContent.displayName = SelectPrimitive.Popup.displayName;

const SelectLabel = (
  {
    ref,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.GroupLabel> & {
    ref?: React.Ref<React.ElementRef<typeof SelectPrimitive.GroupLabel>>;
  }
) => (<SelectPrimitive.GroupLabel
  ref={ref}
  className={cn("px-2 py-1.5 text-sm font-semibold", className)}
  {...props}
/>);
SelectLabel.displayName = SelectPrimitive.GroupLabel.displayName;

type SelectItemProps = React.ComponentPropsWithoutRef<
  typeof SelectPrimitive.Item
> & {
  onSelect?: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>["onClick"];
};

const SelectItem = (
  {
    ref,
    className,
    children,
    onSelect,
    onClick,
    ...props
  }: SelectItemProps & {
    ref?: React.Ref<React.ElementRef<typeof SelectPrimitive.Item>>;
  }
) => {
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);
  const labelContext = React.use(SelectLabelContext);
  const registerLabel = labelContext?.registerLabel;
  const valueKey = props.value == null ? null : String(props.value);
  const label = getTextLabel(children);

  React.useEffect(() => {
    if (valueKey == null) return;
    registerLabel?.(valueKey, label);
    return () => registerLabel?.(valueKey, null);
  }, [label, registerLabel, valueKey]);

  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        "os-select-item relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      onClick={(event) => {
        playClick();
        onSelect?.(event);
        onClick?.(event);
      }}
      render={(itemProps, state) => (
        <div
          {...itemProps}
          data-state={state.selected ? "checked" : "unchecked"}
        />
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check size={12} weight="bold" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
};
SelectItem.displayName = SelectPrimitive.Item.displayName;

interface SelectItemWithDescriptionProps
  extends Omit<
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>,
    "onSelect"
  > {
  description?: string;
  onSelect?: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>["onClick"];
}

const SelectItemWithDescription = (
  {
    ref,
    className,
    children,
    description,
    onSelect,
    onClick,
    ...props
  }: SelectItemWithDescriptionProps & {
    ref?: React.Ref<React.ElementRef<typeof SelectPrimitive.Item>>;
  }
) => {
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);
  const labelContext = React.use(SelectLabelContext);
  const registerLabel = labelContext?.registerLabel;
  const valueKey = props.value == null ? null : String(props.value);
  const label = getTextLabel(children);

  React.useEffect(() => {
    if (valueKey == null) return;
    registerLabel?.(valueKey, label);
    return () => registerLabel?.(valueKey, null);
  }, [label, registerLabel, valueKey]);

  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        "os-select-item-with-description group relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      onClick={(event) => {
        playClick();
        onSelect?.(event);
        onClick?.(event);
      }}
      render={(itemProps, state) => (
        <div
          {...itemProps}
          data-state={state.selected ? "checked" : "unchecked"}
        />
      )}
      {...props}
    >
      <span className="absolute right-2 top-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check size={12} weight="bold" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <div className="flex flex-col gap-0.5">
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
        {description && (
          <span className="text-[11px] text-neutral-500 group-focus:text-inherit font-normal leading-tight">
            {description}
          </span>
        )}
      </div>
    </SelectPrimitive.Item>
  );
};
SelectItemWithDescription.displayName = "SelectItemWithDescription";

const SelectSeparator = (
  {
    ref,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator> & {
    ref?: React.Ref<React.ElementRef<typeof SelectPrimitive.Separator>>;
  }
) => (<SelectPrimitive.Separator
  ref={ref}
  className={cn("-mx-1 my-1 h-px bg-muted", className)}
  {...props}
/>);
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectItemWithDescription,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
