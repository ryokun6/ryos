import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useThemeStore } from "@/stores/useThemeStore";
import {
  useListenSessionStore,
  type ListenSessionSummary,
} from "@/stores/useListenSessionStore";
import { cn } from "@/lib/utils";

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
      return segments[listenIndex + 1].split("?")[0];
    }
  } catch {
    // Not a URL, fall through
  }

  if (trimmed.includes("/listen/")) {
    const parts = trimmed.split("/listen/");
    const sessionPart = parts[1]?.split("/")[0] || "";
    return sessionPart.split("?")[0] || trimmed;
  }

  return trimmed.split("?")[0];
}

export function JoinSessionDialog({
  isOpen,
  onClose,
  onJoin,
}: JoinSessionDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [sessions, setSessions] = useState<ListenSessionSummary[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentTheme = useThemeStore((state) => state.current);
  const fetchSessions = useListenSessionStore((state) => state.fetchSessions);

  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacTheme = currentTheme === "macosx";

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const result = await fetchSessions();
    if (result.ok && result.sessions) {
      setSessions(result.sessions);
    } else {
      setError(result.error || "Failed to load sessions");
      setSessions([]);
    }
    setIsLoading(false);
  }, [fetchSessions]);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setValue("");
      setSelectedIndex(-1);
      setError(null);
      loadSessions();
    }
  }, [isOpen, loadSessions]);

  const handleJoin = useCallback(
    (sessionId?: string) => {
      const id = sessionId || extractSessionId(value);
      if (!id) return;
      onJoin(id);
      setValue("");
      onClose();
    },
    [value, onJoin, onClose]
  );

  const handleJoinSelected = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < sessions.length) {
      handleJoin(sessions[selectedIndex].id);
    }
  }, [selectedIndex, sessions, handleJoin]);

  const handleSelectAndJoin = useCallback(
    (index: number) => {
      if (index >= 0 && index < sessions.length) {
        setSelectedIndex(index);
        handleJoin(sessions[index].id);
      }
    },
    [sessions, handleJoin]
  );

  const handleDialogKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
    },
    []
  );

  const dialogContent = (
    <div className={isXpTheme ? "p-2 px-4" : "p-4 px-6"}>
      {/* Session List - Primary view */}
      <div className="mb-3">
        <ScrollArea className="h-[160px] border border-gray-300 rounded-md overflow-hidden bg-white">
          <div>
            {isLoading ? (
              <div
                className={cn(
                  "flex items-center justify-center h-[140px] text-gray-500",
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
                {t("apps.karaoke.liveListen.loadingSessions")}
              </div>
            ) : error ? (
              <div
                className={cn(
                  "flex items-center justify-center h-[140px] text-red-600",
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
              </div>
            ) : sessions.length === 0 ? (
              <div
                className={cn(
                  "flex items-center justify-center h-[140px] text-gray-500",
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
                {t("apps.karaoke.liveListen.noActiveSessions")}
              </div>
            ) : (
              sessions.map((session, index) => (
                <div
                  key={session.id}
                  onClick={() => setSelectedIndex(index)}
                  onDoubleClick={() => handleSelectAndJoin(index)}
                  onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSelectAndJoin(index);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  className={cn(
                    "px-2 py-1.5 cursor-pointer",
                    selectedIndex === index
                      ? ""
                      : index % 2 === 1
                        ? "bg-gray-100"
                        : "bg-white",
                    isXpTheme
                      ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                      : "font-geneva-12 text-[12px]"
                  )}
                  style={{
                    fontFamily: isXpTheme
                      ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                      : undefined,
                    fontSize: isXpTheme ? "11px" : undefined,
                    ...(selectedIndex === index
                      ? {
                          background: "var(--os-color-selection-bg)",
                          color: "var(--os-color-selection-text)",
                        }
                      : {}),
                  }}
                >
                  <div className="font-semibold">
                    @{session.djUsername}
                    <span
                      className={cn(
                        "font-normal ml-2",
                        selectedIndex === index
                          ? "opacity-70"
                          : "text-neutral-500"
                      )}
                    >
                      {session.listenerCount}{" "}
                      {session.listenerCount === 1
                        ? t("apps.karaoke.liveListen.listener")
                        : t("apps.karaoke.liveListen.listenerPlural")}
                    </span>
                  </div>
                  {session.currentTrackMeta && (
                    <div
                      className={cn(
                        selectedIndex === index
                          ? "opacity-80"
                          : "text-neutral-600"
                      )}
                    >
                      {session.currentTrackMeta.title}
                      {session.currentTrackMeta.artist &&
                        ` • ${session.currentTrackMeta.artist}`}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Manual Entry - Secondary option */}
      <p
        className={cn(
          "text-gray-500 mb-2",
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
        {t("apps.karaoke.liveListen.orEnterSessionId")}
      </p>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && value.trim()) {
              handleJoin();
            }
          }}
          placeholder={t("apps.karaoke.liveListen.sessionLinkPlaceholder")}
          className={cn(
            "shadow-none flex-1",
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
        />
        <Button
          variant={isMacTheme ? "secondary" : "retro"}
          onClick={() => handleJoin()}
          disabled={!value.trim()}
          className={cn(
            "flex-shrink-0",
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
          {t("apps.karaoke.liveListen.joinButton")}
        </Button>
      </div>

      {/* Footer with Cancel/Join when sessions available */}
      {sessions.length > 0 && (
        <DialogFooter className="mt-4 gap-1 sm:justify-end">
          <div className="flex flex-col-reverse gap-2 w-full sm:w-auto sm:flex-row">
            <Button
              variant={isMacTheme ? "secondary" : "retro"}
              onClick={onClose}
              className={cn(
                "w-full sm:w-auto",
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
              {t("apps.karaoke.liveListen.cancel")}
            </Button>
            <Button
              variant={isMacTheme ? "default" : "retro"}
              onClick={handleJoinSelected}
              disabled={selectedIndex < 0}
              className={cn(
                "w-full sm:w-auto",
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
              {t("apps.karaoke.liveListen.joinButton")}
            </Button>
          </div>
        </DialogFooter>
      )}
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn("max-w-[420px]", isXpTheme && "p-0 overflow-hidden")}
        style={isXpTheme ? { fontSize: "11px" } : undefined}
        onKeyDown={handleDialogKeyDown}
      >
        {isXpTheme ? (
          <>
            <DialogHeader>
              {t("apps.karaoke.liveListen.joinSession")}
            </DialogHeader>
            <div className="window-body">{dialogContent}</div>
          </>
        ) : isMacTheme ? (
          <>
            <DialogHeader>
              {t("apps.karaoke.liveListen.joinSession")}
            </DialogHeader>
            {dialogContent}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-normal text-[16px]">
                {t("apps.karaoke.liveListen.joinSession")}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t("apps.karaoke.liveListen.pasteLinkOrId")}
              </DialogDescription>
            </DialogHeader>
            {dialogContent}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
