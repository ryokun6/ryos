import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";

interface ListenSessionInviteProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
}

export function ListenSessionInvite({
  isOpen,
  onClose,
  sessionId,
}: ListenSessionInviteProps) {
  const [shareUrl, setShareUrl] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const baseUrl = useMemo(() => {
    if (typeof window !== "undefined") {
      return window.location.origin;
    }
    return "https://os.ryo.lu";
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setShareUrl("");
      return;
    }
    setShareUrl(`${baseUrl}/listen/${sessionId}`);
  }, [baseUrl, isOpen, sessionId]);

  useEffect(() => {
    if (shareUrl && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [shareUrl]);

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied", {
        description: "Share the link to invite friends.",
      });
      onClose();
    } catch (error) {
      toast.error("Copy failed", {
        description: "Select the link and copy manually.",
      });
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-os-window-bg border-[length:var(--os-metrics-border-width)] border-os-window rounded-os shadow-os-window max-w-xs">
        <DialogHeader>
          <DialogTitle className="font-normal text-[16px]">
            Share Listen Session
          </DialogTitle>
        </DialogHeader>

        <div className="p-3 w-full space-y-3">
          <div className="flex flex-col items-center space-y-3">
            <div className="bg-white p-1.5 w-32 h-32 flex items-center justify-center">
              <QRCodeSVG
                value={shareUrl}
                size={112}
                level="M"
                includeMargin={false}
                className="w-28 h-28"
              />
            </div>
            <p className="text-neutral-500 text-center font-geneva-12 text-xs">
              Share this link to invite friends to listen together.
            </p>
          </div>

          <Input ref={inputRef} value={shareUrl} readOnly className="shadow-none h-8 w-full text-sm" />

          <div className="flex justify-end">
            <Button variant="retro" onClick={handleCopy}>
              Copy Link
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
