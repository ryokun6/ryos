import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { OS_SHELL_TEXT_SCALE_CLASS } from "@/lib/themeChrome";
import { useSound, Sounds } from "@/hooks/useSound";
import { useVibration } from "@/hooks/useVibration";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { TrafficLightButton } from "@/components/shared/TrafficLightButton";
import { DialogParentWindowContext } from "@/components/shared/DialogParentWindowContext";

const Dialog = ({
  children,
  onOpenChange,
  ...props
}: DialogPrimitive.DialogProps) => {
  const { play: playWindowOpen } = useSound(Sounds.WINDOW_OPEN);
  const { play: playWindowClose } = useSound(Sounds.WINDOW_CLOSE);
  const vibrateClose = useVibration(50, 50);

  // Flag to prevent double-playing the open sound when `onOpenChange`
  // also triggers after programmatically opening the dialog
  const skipOpenEffectRef = React.useRef(false);

  // Play open sound if the dialog is mounted with `open` already true or if
  // `open` is changed programmatically without triggering `onOpenChange`.
  React.useEffect(() => {
    if (props.open && !skipOpenEffectRef.current) {
      playWindowOpen();
    }
    // Reset the flag so subsequent `open` changes trigger the effect again
    skipOpenEffectRef.current = false;
  }, [props.open, playWindowOpen]);

  return (
    <DialogPrimitive.Root
      {...props}
      onOpenChange={(open) => {
        if (open) {
          playWindowOpen();
          // Prevent the effect from replaying the sound for this change
          skipOpenEffectRef.current = true;
        } else {
          vibrateClose();
          playWindowClose();
        }
        onOpenChange?.(open);
      }}
    >
      {children}
    </DialogPrimitive.Root>
  );
};
Dialog.displayName = DialogPrimitive.Root.displayName;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  overlayClassName?: string;
  /**
   * Opt out of the macOS sheet presentation (dialog slides out from the
   * parent window titlebar) and always render as a centered modal.
   */
  disableSheet?: boolean;
}

/** Viewport-space anchor line a sheet slides out from (parent titlebar). */
interface SheetAnchor {
  left: number;
  top: number;
  width: number;
}

function measureSheetAnchor(parentInstanceId: string): SheetAnchor | null {
  const frame = document.querySelector<HTMLElement>(
    `[data-window-instance-id="${CSS.escape(parentInstanceId)}"]`
  );
  if (!frame) return null;
  // `.window` is the visible chrome; the outer frame carries mobile padding.
  const chrome = frame.querySelector<HTMLElement>(".window") ?? frame;
  const rect = chrome.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const titleBar = chrome.querySelector<HTMLElement>(":scope > .title-bar");
  const top = titleBar ? titleBar.getBoundingClientRect().bottom : rect.top;
  return { left: rect.left, top, width: rect.width };
}

const DialogContent = (
  {
    ref,
    className,
    children,
    overlayClassName,
    disableSheet = false,
    style,
    ...props
  }: DialogContentProps & {
    ref?: React.Ref<React.ElementRef<typeof DialogPrimitive.Content>>;
  }
) => {
  const { isWindowsTheme, isMacOSTheme, isSystem7Theme } = useThemeFlags();
  const parentWindowInstanceId = React.useContext(DialogParentWindowContext);

  // Mac OS X sheet behavior: when a dialog is opened from inside an app
  // window on the Aqua theme, attach it to that window and slide it out from
  // under the titlebar instead of showing a centered modal.
  const wantsSheet =
    isMacOSTheme && !disableSheet && parentWindowInstanceId !== null;

  const [sheetAnchor, setSheetAnchor] = React.useState<
    SheetAnchor | "unavailable" | null
  >(null);
  const hasMeasuredAnchor =
    sheetAnchor !== null && sheetAnchor !== "unavailable";

  // Only commit state when the measurement actually changed: Radix recomposes
  // its internal ref chain on every render (detach + reattach), so this
  // callback fires repeatedly and an unconditional set would loop forever.
  const updateSheetAnchor = React.useCallback(() => {
    if (!parentWindowInstanceId) return;
    const next = measureSheetAnchor(parentWindowInstanceId) ?? "unavailable";
    setSheetAnchor((prev) => {
      if (prev === next) return prev;
      if (
        typeof prev === "object" &&
        prev !== null &&
        typeof next === "object" &&
        prev.left === next.left &&
        prev.top === next.top &&
        prev.width === next.width
      ) {
        return prev;
      }
      return next;
    });
  }, [parentWindowInstanceId]);

  // Measure the parent window when the (portaled) content mounts. The ref
  // callback runs before paint, so the pre-measure hidden frame never shows.
  const measureRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !wantsSheet) return;
      updateSheetAnchor();
    },
    [wantsSheet, updateSheetAnchor]
  );

  const composedContentRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      measureRef(node);
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [measureRef, ref]
  );

  // Keep the sheet attached if the viewport (and thus window layout) changes.
  React.useEffect(() => {
    if (!hasMeasuredAnchor) return;
    window.addEventListener("resize", updateSheetAnchor);
    return () => window.removeEventListener("resize", updateSheetAnchor);
  }, [hasMeasuredAnchor, updateSheetAnchor]);

  // Fall back to the centered modal when the parent window can't be found.
  const isSheet = wantsSheet && sheetAnchor !== "unavailable";

  // Function to clean up pointer-events
  const cleanupPointerEvents = React.useCallback(() => {
    // Use RAF to ensure this runs after animations complete
    requestAnimationFrame(() => {
      document.body.style.removeProperty("pointer-events");
    });
  }, []);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => cleanupPointerEvents();
  }, [cleanupPointerEvents]);

  const getDialogContentClasses = () => {
    if (isWindowsTheme) {
      return cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full min-w-0 max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 p-0 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 origin-center",
        "window", // Use xp.css window class
        className
      );
    }

    if (isMacOSTheme) {
      return cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full min-w-0 max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-os-window-bg p-0 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 origin-center overflow-hidden",
        // Ensure all descendant buttons use 13px text size in macOSX dialogs
        "border-[length:var(--os-metrics-border-width)] border-os-window shadow-os-window macosx-dialog [&_button]:text-[length:var(--os-typography-button)]",
        className
      );
    }

    // Default System 7 style
    return cn(
      "fixed left-[50%] top-[50%] z-50 grid w-full min-w-0 max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-0 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 origin-center",
      "bg-os-window-bg border-[length:var(--os-metrics-border-width)] border-os-window shadow-os-window",
      className
    );
  };

  if (isSheet) {
    const anchor = hasMeasuredAnchor ? (sheetAnchor as SheetAnchor) : null;
    return (
      <DialogPortal>
        {/* Sheets don't dim the desktop; the overlay only blocks interaction */}
        <DialogPrimitive.Overlay
          className={cn("fixed inset-0 z-50 bg-transparent", overlayClassName)}
        />
        {/* Full-window-width strip below the titlebar; overflow-hidden clips
            the sheet while it slides out from behind the titlebar. Pointer
            events pass through the strip padding to the overlay. */}
        <DialogPrimitive.Content
          ref={composedContentRef}
          className="macosx-sheet-strip fixed z-50 flex flex-col items-center overflow-hidden px-4 pb-10"
          style={
            anchor
              ? {
                  left: anchor.left,
                  top: anchor.top,
                  width: anchor.width,
                  pointerEvents: "none",
                }
              : {
                  left: 0,
                  top: 0,
                  width: "100%",
                  visibility: "hidden",
                  pointerEvents: "none",
                }
          }
          onEscapeKeyDown={cleanupPointerEvents}
          onPointerDownOutside={cleanupPointerEvents}
          onCloseAutoFocus={cleanupPointerEvents}
          {...props}
        >
          <div
            className={cn(
              "macosx-sheet-body pointer-events-auto grid w-full min-w-0 max-w-lg gap-4 border bg-os-window-bg p-0 overflow-hidden",
              "border-[length:var(--os-metrics-border-width)] border-os-window macosx-dialog [&_button]:text-[length:var(--os-typography-button)]",
              className
            )}
            style={{
              ...(anchor
                ? { maxHeight: `calc(100dvh - ${anchor.top}px - 12px)` }
                : undefined),
              ...style,
            }}
          >
            <div
              className={cn(
                "flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-x-hidden",
                OS_SHELL_TEXT_SCALE_CLASS
              )}
              style={{
                backgroundColor: "var(--os-color-window-bg)",
                backgroundImage: "var(--os-pinstripe-window)",
              }}
            >
              {children}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  }

  return (
    <DialogPortal>
      <DialogPrimitive.Overlay className={cn("fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", overlayClassName)} />
      <DialogPrimitive.Content
        ref={composedContentRef}
        className={getDialogContentClasses()}
        style={style}
        onEscapeKeyDown={cleanupPointerEvents}
        onPointerDownOutside={cleanupPointerEvents}
        onCloseAutoFocus={cleanupPointerEvents}
        {...props}
      >
        <div
          className={cn(
            "flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-x-hidden",
            isMacOSTheme && OS_SHELL_TEXT_SCALE_CLASS
          )}
          style={
            isMacOSTheme
              ? {
                  backgroundColor: "var(--os-color-window-bg)",
                  backgroundImage: "var(--os-pinstripe-window)",
                }
              : isSystem7Theme
              ? { backgroundColor: "var(--os-color-panel-bg)" }
              : undefined
          }
        >
          {children}
        </div>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
};
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const { t } = useTranslation();
  const { isWinXp, isWindowsTheme, isMacOSTheme } = useThemeFlags();
  const closeRef = React.useRef<HTMLButtonElement>(null);

  if (isWindowsTheme) {
    return (
      <div
        className={cn("title-bar", className)}
        style={isWinXp ? { minHeight: "30px" } : undefined}
        {...props}
      >
        <div className="title-bar-text">{children}</div>
        <div className="title-bar-controls">
          <DialogPrimitive.Close asChild>
            <button aria-label={t("common.dialog.close")} data-action="close" />
          </DialogPrimitive.Close>
        </div>
      </div>
    );
  }

  if (isMacOSTheme) {
    return (
      <div
        className={cn(
          "flex items-center shrink-0 h-6 min-h-[1.25rem] mx-0 mb-0 px-[0.1rem] py-[0.1rem] select-none cursor-move user-select-none z-50 draggable-area macosx-dialog-header",
          className
        )}
        style={{
          borderRadius: "8px 8px 0px 0px",
          backgroundImage: "var(--os-pinstripe-titlebar)",
          borderBottom: "1px solid var(--os-color-titlebar-border, rgba(0, 0, 0, 0.1))",
        }}
        {...props}
      >
        {/* Traffic Light Buttons */}
        <DialogPrimitive.Close ref={closeRef} className="hidden" />
        <div className="group/traffic flex items-center gap-2 ml-1.5">
          <TrafficLightButton
            color="red"
            onClick={() => closeRef.current?.click()}
            isForeground={true}
            ariaLabel={t("common.dialog.close")}
          />
          <TrafficLightButton
            color="yellow"
            onClick={() => {}}
            isForeground={false}
            ariaLabel={t("common.window.minimizeDisabled")}
          />
          <TrafficLightButton
            color="green"
            onClick={() => {}}
            isForeground={false}
            ariaLabel={t("common.window.maximizeDisabled")}
          />
        </div>

        {/* Title */}
        <span
          className="select-none mx-auto px-2 py-0 h-full flex items-center whitespace-nowrap overflow-hidden text-ellipsis max-w-[80%] text-[13px] text-os-titlebar-active-text"
          style={{
            textShadow: "0 2px 3px rgba(0, 0, 0, 0.25)",
            fontWeight: 500,
          }}
        >
          <span className="truncate">{children}</span>
        </span>

        {/* Spacer to balance the traffic lights */}
        <div className="mr-2 w-12 h-4" />
      </div>
    );
  }

  // Default System 7 style
  return (
    <div
      className={cn(
        "flex items-center shrink-0 h-os-titlebar min-h-[1.5rem] mx-0 my-[0.1rem] mb-0 px-[0.1rem] py-[0.2rem] select-none cursor-move border-b-[1.5px] user-select-none z-50 draggable-area border-b-os-window",
        className
      )}
      style={{
        background: `var(--os-color-titlebar-pattern, none) 0 0 / 6.6666666667% 13.3333333333% repeat padding-box content-box, white`,
      }}
      {...props}
    >
      <DialogPrimitive.Close asChild>
        <div className="relative ml-2 size-4 cursor-default select-none">
          <div className="absolute inset-0 -m-2" />
          <div className="size-4 bg-os-button-face shadow-[0_0_0_1px_var(--os-color-button-face)] border-2 border-os-window hover:bg-neutral-200 active:bg-neutral-300 flex items-center justify-center" />
        </div>
      </DialogPrimitive.Close>
      <div className="select-none mx-auto bg-os-button-face px-2 py-0 h-full flex items-center justify-center text-os-titlebar-active-text">
        {children}
      </div>
      <div className="mr-2 size-4" />
    </div>
  );
};
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-1.5 sm:flex-row sm:justify-end",
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = (
  {
    ref,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title> & {
    ref?: React.Ref<React.ElementRef<typeof DialogPrimitive.Title>>;
  }
) => (<DialogPrimitive.Title
  ref={ref}
  className={cn(
    "text-lg font-semibold leading-none tracking-tight",
    className
  )}
  {...props}
/>);
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = (
  {
    ref,
    className,
    ...props
  }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description> & {
    ref?: React.Ref<React.ElementRef<typeof DialogPrimitive.Description>>;
  }
) => (<DialogPrimitive.Description
  ref={ref}
  className={cn("text-sm text-muted-foreground", className)}
  {...props}
/>);
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
