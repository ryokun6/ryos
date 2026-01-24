import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface JoinSessionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onJoin: (sessionId: string) => void;
}

function extractSessionId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split("/").filter(Boolean);
    const listenIndex = segments.indexOf("listen");
    if (listenIndex >= 0 && segments[listenIndex + 1]) {
      return segments[listenIndex + 1];
    }
  } catch {
    // Not a URL, fall through
  }

  if (trimmed.includes("/listen/")) {
    const parts = trimmed.split("/listen/");
    return parts[1]?.split("/")[0] || trimmed;
  }

  return trimmed;
}

export function JoinSessionDialog({
  isOpen,
  onClose,
  onJoin,
}: JoinSessionDialogProps) {
  const [value, setValue] = useState("");

  const handleJoin = () => {
    const sessionId = extractSessionId(value);
    if (!sessionId) return;
    onJoin(sessionId);
    setValue("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-os-window-bg border-[length:var(--os-metrics-border-width)] border-os-window rounded-os shadow-os-window max-w-xs">
        <DialogHeader>
          <DialogTitle className="font-normal text-[16px]">
            Join Listen Session
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Paste a session link or ID"
            className="h-8"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="retro" onClick={handleJoin}>
              Join
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
