import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRef, useEffect } from "react";
import { useSound, Sounds } from "@/hooks/useSound";

interface ConfirmDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
}

export function ConfirmDialog({
  isOpen,
  onOpenChange,
  onConfirm,
  title,
  description,
}: ConfirmDialogProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const { play: playAlertSound } = useSound(Sounds.ALERT_SOSUMI);

  // Play sound when dialog opens
  useEffect(() => {
    if (isOpen) {
      playAlertSound();
    }
  }, [isOpen, playAlertSound]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-system7-window-bg border-2 border-black rounded-lg shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)]"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          confirmButtonRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-normal text-[16px]">{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
        </DialogHeader>
        <div className="p-4 px-6">
          <div className="flex gap-3 items-start">
            <img
              src="/icons/warn.png"
              alt="Warning"
              className="w-[32px] h-[32px] mt-0.5 [image-rendering:pixelated]"
              width={32}
              height={32}
            />
            <p className="text-gray-900 mb-2 leading-tight font-geneva-12 text-[12px]">
              {description}
            </p>
          </div>
          <DialogFooter className="mt-4 gap-1">
            <Button
              variant="retro"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button variant="retro" onClick={onConfirm} ref={confirmButtonRef}>
              Confirm
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
