import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { useSound, Sounds } from "@/hooks/useSound";

const Dialog = ({ children, ...props }: DialogPrimitive.DialogProps) => {
  const { play: playWindowClose } = useSound(Sounds.WINDOW_CLOSE);

  return (
    <DialogPrimitive.Root
      onOpenChange={(open) => {
        if (!open) {
          playWindowClose();
        }
        props.onOpenChange?.(open);
      }}
      {...props}
    >
      {children}
    </DialogPrimitive.Root>
  );
};
Dialog.displayName = DialogPrimitive.Root.displayName;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
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

  return (
    <DialogPortal>
      <DialogPrimitive.Overlay 
        className="fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
      />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-0 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 origin-center sm:rounded-lg",
          className
        )}
        onEscapeKeyDown={cleanupPointerEvents}
        onPointerDownOutside={cleanupPointerEvents}
        onCloseAutoFocus={cleanupPointerEvents}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex items-center h-6 mx-0 my-[0.1rem] px-[0.1rem] py-[0.2rem] bg-[linear-gradient(#000_50%,transparent_0)] bg-clip-content bg-[length:6.6666666667%_13.3333333333%] border-b-[2px] border-black",
      className
    )}
    {...props}
  >
    <DialogPrimitive.Close className="ml-2 w-4 h-4 bg-white border-2 border-black hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center shadow-[0_0_0_1px_white] focus:outline-none focus:ring-0" />
    <div className="select-none mx-auto bg-white px-2 py-0 h-full flex items-center justify-center">
      {children}
    </div>
    <div className="mr-2 w-4 h-4" />
  </div>
);
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
