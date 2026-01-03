import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useSound, Sounds } from "@/hooks/useSound";
import { useVibration } from "@/hooks/useVibration";
import { useThemeStore } from "@/stores/useThemeStore";
import { getTheme } from "@/themes";

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
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, overlayClassName, ...props }, ref) => {
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOsxTheme = currentTheme === "macosx";

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
    if (isXpTheme) {
      return cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 p-0 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 origin-center",
        "window", // Use xp.css window class
        className
      );
    }

    if (isMacOsxTheme) {
      return cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-os-window-bg p-0 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 origin-center overflow-hidden",
        // Ensure all descendant buttons use 13px text size in macOSX dialogs
        "border-[length:var(--os-metrics-border-width)] border-os-window shadow-os-window macosx-dialog [&_button]:text-[13px]",
        className
      );
    }

    // Default System 7 style
    return cn(
      "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-0 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 origin-center",
      "bg-os-window-bg border-[length:var(--os-metrics-border-width)] border-os-window shadow-os-window",
      className
    );
  };

  return (
    <DialogPortal>
      <DialogPrimitive.Overlay className={cn("fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0", overlayClassName)} />
      <DialogPrimitive.Content
        ref={ref}
        className={getDialogContentClasses()}
        onEscapeKeyDown={cleanupPointerEvents}
        onPointerDownOutside={cleanupPointerEvents}
        onCloseAutoFocus={cleanupPointerEvents}
        {...props}
      >
        <div
          className="flex flex-1 min-h-0 flex-col"
          style={
            isMacOsxTheme
              ? {
                  backgroundColor: "var(--os-color-window-bg)",
                  backgroundImage: "var(--os-pinstripe-window)",
                }
              : undefined
          }
        >
          {children}
        </div>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOsxTheme = currentTheme === "macosx";

  if (isXpTheme) {
    return (
      <div
        className={cn("title-bar", className)}
        style={currentTheme === "xp" ? { minHeight: "30px" } : undefined}
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

  if (isMacOsxTheme) {
    const theme = getTheme(currentTheme);
    return (
      <div
        className={cn(
          "flex items-center shrink-0 h-6 min-h-[1.25rem] mx-0 mb-0 px-[0.1rem] py-[0.1rem] select-none cursor-move user-select-none z-50 draggable-area macosx-dialog-header",
          className
        )}
        style={{
          borderRadius: "8px 8px 0px 0px",
          backgroundImage: "var(--os-pinstripe-titlebar)",
          borderBottom: `1px solid ${
            theme.colors.titleBar.borderBottom ||
            theme.colors.titleBar.border ||
            "rgba(0, 0, 0, 0.1)"
          }`,
        }}
        {...props}
      >
        {/* Traffic Light Buttons */}
        <div className="flex items-center gap-2 ml-1.5">
          {/* Close Button (Red) */}
          <DialogPrimitive.Close asChild>
            <button
              className="rounded-full relative overflow-hidden cursor-default outline-none box-border"
              style={{
                width: "13px",
                height: "13px",
                background:
                  "linear-gradient(rgb(193, 58, 45), rgb(205, 73, 52))",
                boxShadow:
                  "rgba(0, 0, 0, 0.5) 0px 2px 4px, rgba(0, 0, 0, 0.4) 0px 1px 2px, rgba(225, 70, 64, 0.5) 0px 1px 1px, rgba(0, 0, 0, 0.3) 0px 0px 0px 0.5px inset, rgba(150, 40, 30, 0.8) 0px 1px 3px inset, rgba(225, 70, 64, 0.75) 0px 2px 3px 1px inset",
              }}
              aria-label={t("common.dialog.close")}
            >
              {/* Top shine */}
              <div
                className="absolute left-1/2 transform -translate-x-1/2 pointer-events-none"
                style={{
                  height: "33%",
                  background:
                    "linear-gradient(rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.3))",
                  width: "calc(100% - 6px)",
                  borderRadius: "6px 6px 0 0",
                  top: "1px",
                  filter: "blur(0.2px)",
                  zIndex: 2,
                }}
              />
              {/* Bottom glow */}
              <div
                className="absolute left-1/2 transform -translate-x-1/2 pointer-events-none"
                style={{
                  height: "33%",
                  background:
                    "linear-gradient(rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.5))",
                  width: "calc(100% - 3px)",
                  borderRadius: "0 0 6px 6px",
                  bottom: "1px",
                  filter: "blur(0.3px)",
                }}
              />
            </button>
          </DialogPrimitive.Close>
          {/* Minimize Button (Yellow) - Inactive */}
          <button
            className="rounded-full relative overflow-hidden cursor-default outline-none box-border"
            style={{
              width: "13px",
              height: "13px",
              background:
                "linear-gradient(rgba(160, 160, 160, 0.625), rgba(255, 255, 255, 0.625))",
              boxShadow:
                "0 2px 3px rgba(0, 0, 0, 0.2), 0 1px 1px rgba(0, 0, 0, 0.3), inset 0 0 0 0.5px rgba(0, 0, 0, 0.3), inset 0 1px 2px rgba(0, 0, 0, 0.4), inset 0 2px 3px 1px #bbbbbb",
              pointerEvents: "none",
            }}
            aria-label={t("common.window.minimizeDisabled")}
            disabled
          >
            {/* Top shine */}
            <div
              className="absolute left-1/2 transform -translate-x-1/2 pointer-events-none"
              style={{
                height: "33%",
                background:
                  "linear-gradient(rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.3))",
                width: "calc(100% - 6px)",
                borderRadius: "6px 6px 0 0",
                top: "1px",
                filter: "blur(0.2px)",
                zIndex: 2,
              }}
            />
            {/* Bottom glow */}
            <div
              className="absolute left-1/2 transform -translate-x-1/2 pointer-events-none"
              style={{
                height: "33%",
                background:
                  "linear-gradient(rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.5))",
                width: "calc(100% - 3px)",
                borderRadius: "0 0 6px 6px",
                bottom: "1px",
                filter: "blur(0.3px)",
              }}
            />
          </button>
          {/* Maximize Button (Green) - Inactive */}
          <button
            className="rounded-full relative overflow-hidden cursor-default outline-none box-border"
            style={{
              width: "13px",
              height: "13px",
              background:
                "linear-gradient(rgba(160, 160, 160, 0.625), rgba(255, 255, 255, 0.625))",
              boxShadow:
                "0 2px 3px rgba(0, 0, 0, 0.2), 0 1px 1px rgba(0, 0, 0, 0.3), inset 0 0 0 0.5px rgba(0, 0, 0, 0.3), inset 0 1px 2px rgba(0, 0, 0, 0.4), inset 0 2px 3px 1px #bbbbbb",
              pointerEvents: "none",
            }}
            aria-label={t("common.window.maximizeDisabled")}
            disabled
          >
            {/* Top shine */}
            <div
              className="absolute left-1/2 transform -translate-x-1/2 pointer-events-none"
              style={{
                height: "33%",
                background:
                  "linear-gradient(rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.3))",
                width: "calc(100% - 6px)",
                borderRadius: "6px 6px 0 0",
                top: "1px",
                filter: "blur(0.2px)",
                zIndex: 2,
              }}
            />
            {/* Bottom glow */}
            <div
              className="absolute left-1/2 transform -translate-x-1/2 pointer-events-none"
              style={{
                height: "33%",
                background:
                  "linear-gradient(rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.5))",
                width: "calc(100% - 3px)",
                borderRadius: "0 0 6px 6px",
                bottom: "1px",
                filter: "blur(0.3px)",
              }}
            />
          </button>
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
        "flex items-center shrink-0 h-os-titlebar min-h-[1.5rem] mx-0 my-[0.1rem] mb-0 px-[0.1rem] py-[0.2rem] select-none cursor-move border-b-[1.5px] user-select-none z-50 draggable-area bg-os-titlebar-active-bg bg-os-titlebar-pattern bg-clip-content bg-[length:6.6666666667%_13.3333333333%] border-b-os-window",
        className
      )}
      {...props}
    >
      <DialogPrimitive.Close asChild>
        <div className="relative ml-2 w-4 h-4 cursor-default select-none">
          <div className="absolute inset-0 -m-2" />
          <div className="w-4 h-4 bg-os-button-face shadow-[0_0_0_1px_var(--os-color-button-face)] border-2 border-os-window hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center" />
        </div>
      </DialogPrimitive.Close>
      <div className="select-none mx-auto bg-os-button-face px-2 py-0 h-full flex items-center justify-center text-os-titlebar-active-text">
        {children}
      </div>
      <div className="mr-2 w-4 h-4" />
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
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
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
