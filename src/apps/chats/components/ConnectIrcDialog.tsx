import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useThemeStore } from "@/stores/useThemeStore";
import { cn } from "@/lib/utils";

interface ConnectIrcDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect: (host: string, port: number, nickname: string) => Promise<{ ok: boolean; error?: string }>;
  defaultNickname?: string | null;
}

export function ConnectIrcDialog({
  isOpen,
  onOpenChange,
  onConnect,
  defaultNickname,
}: ConnectIrcDialogProps) {
  const [host, setHost] = useState("irc.pieter.com");
  const [port, setPort] = useState("6667");
  const [nickname, setNickname] = useState(defaultNickname || "");
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Theme detection
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacTheme = currentTheme === "macosx";

  // Reset form when dialog opens
  useEffect(() => {
    if (isOpen) {
      setHost("irc.pieter.com");
      setPort("6667");
      setNickname(defaultNickname || "");
      setError(null);
    }
  }, [isOpen, defaultNickname]);

  const handleSubmit = async () => {
    setError(null);
    
    if (!host.trim() || !port.trim() || !nickname.trim()) {
      setError("All fields are required");
      return;
    }

    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setError("Port must be a number between 1 and 65535");
      return;
    }

    setIsConnecting(true);
    const result = await onConnect(host.trim(), portNum, nickname.trim());
    setIsConnecting(false);

    if (result.ok) {
      onOpenChange(false);
    } else {
      setError(result.error || "Failed to connect");
    }
  };

  const dialogContent = (
    <div className={isXpTheme ? "pt-2 pb-6 px-4" : "pt-2 pb-6 px-6"}>
      <div className="space-y-3">
        <div className="space-y-2">
          <Label
            htmlFor="irc-host"
            className={cn(
              "text-gray-700",
              isXpTheme
                ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                : "font-geneva-12 text-[12px]"
            )}
            style={{
              fontFamily: isXpTheme
                ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                : undefined,
              fontSize: isXpTheme ? "11px" : undefined,
            }}
          >
            Server
          </Label>
          <Input
            id="irc-host"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="irc.pieter.com"
            className={cn(
              "shadow-none h-8",
              isXpTheme
                ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                : "font-geneva-12 text-[12px]"
            )}
            style={{
              fontFamily: isXpTheme
                ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                : undefined,
              fontSize: isXpTheme ? "11px" : undefined,
            }}
            disabled={isConnecting}
          />
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="irc-port"
            className={cn(
              "text-gray-700",
              isXpTheme
                ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                : "font-geneva-12 text-[12px]"
            )}
            style={{
              fontFamily: isXpTheme
                ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                : undefined,
              fontSize: isXpTheme ? "11px" : undefined,
            }}
          >
            Port
          </Label>
          <Input
            id="irc-port"
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder="6667"
            min="1"
            max="65535"
            className={cn(
              "shadow-none h-8",
              isXpTheme
                ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                : "font-geneva-12 text-[12px]"
            )}
            style={{
              fontFamily: isXpTheme
                ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                : undefined,
              fontSize: isXpTheme ? "11px" : undefined,
            }}
            disabled={isConnecting}
          />
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="irc-nickname"
            className={cn(
              "text-gray-700",
              isXpTheme
                ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                : "font-geneva-12 text-[12px]"
            )}
            style={{
              fontFamily: isXpTheme
                ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                : undefined,
              fontSize: isXpTheme ? "11px" : undefined,
            }}
          >
            Nickname
          </Label>
          <Input
            id="irc-nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Your IRC nickname"
            className={cn(
              "shadow-none h-8",
              isXpTheme
                ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                : "font-geneva-12 text-[12px]"
            )}
            style={{
              fontFamily: isXpTheme
                ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                : undefined,
              fontSize: isXpTheme ? "11px" : undefined,
            }}
            disabled={isConnecting}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isConnecting) {
                handleSubmit();
              }
            }}
          />
        </div>
      </div>

      {error && (
        <p
          className={cn(
            "text-red-600 mt-3",
            isXpTheme
              ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
              : "font-geneva-12 text-[12px]"
          )}
          style={{
            fontFamily: isXpTheme
              ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
              : undefined,
            fontSize: isXpTheme ? "11px" : undefined,
          }}
        >
          {error}
        </p>
      )}

      <DialogFooter className="mt-4 gap-1 sm:gap-0">
        <Button
          variant={isMacTheme ? "secondary" : "retro"}
          onClick={() => onOpenChange(false)}
          disabled={isConnecting}
          className={cn(
            !isMacTheme && "h-7",
            isXpTheme
              ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
              : "font-geneva-12 text-[12px]"
          )}
          style={{
            fontFamily: isXpTheme
              ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
              : undefined,
            fontSize: isXpTheme ? "11px" : undefined,
          }}
        >
          Cancel
        </Button>
        <Button
          variant={isMacTheme ? "default" : "retro"}
          onClick={handleSubmit}
          disabled={isConnecting || !host.trim() || !port.trim() || !nickname.trim()}
          className={cn(
            !isMacTheme && "h-7",
            isXpTheme
              ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
              : "font-geneva-12 text-[12px]"
          )}
          style={{
            fontFamily: isXpTheme
              ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
              : undefined,
            fontSize: isXpTheme ? "11px" : undefined,
          }}
        >
          {isConnecting ? "Connecting..." : "Connect"}
        </Button>
      </DialogFooter>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-[400px]",
          isXpTheme && "p-0 overflow-hidden"
        )}
        style={
          isXpTheme
            ? { fontSize: "11px" }
            : undefined
        }
      >
        {isXpTheme ? (
          <>
            <DialogHeader>Connect to IRC</DialogHeader>
            <div className="window-body">{dialogContent}</div>
          </>
        ) : currentTheme === "macosx" ? (
          <>
            <DialogHeader>Connect to IRC</DialogHeader>
            {dialogContent}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-normal text-[16px]">
                Connect to IRC
              </DialogTitle>
              <DialogDescription className="sr-only">
                Enter IRC server details to connect
              </DialogDescription>
            </DialogHeader>
            {dialogContent}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
