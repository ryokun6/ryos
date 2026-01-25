import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import {
  ArrowsClockwise,
  Users,
  MusicNote,
  Headphones,
} from "@phosphor-icons/react";

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
      // Remove any query params that might be attached
      return segments[listenIndex + 1].split("?")[0];
    }
  } catch {
    // Not a URL, fall through
  }

  if (trimmed.includes("/listen/")) {
    const parts = trimmed.split("/listen/");
    // Remove any query params and path segments after the session ID
    const sessionPart = parts[1]?.split("/")[0] || "";
    return sessionPart.split("?")[0] || trimmed;
  }

  // If it's just a plain ID, strip any query params
  return trimmed.split("?")[0];
}

function SessionListItem({
  session,
  onJoin,
  isXpTheme,
}: {
  session: ListenSessionSummary;
  onJoin: (sessionId: string) => void;
  isXpTheme: boolean;
}) {
  const { t } = useTranslation();

  return (
    <button
      onClick={() => onJoin(session.id)}
      className={cn(
        "w-full text-left p-2 rounded border border-transparent hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1",
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
      <div className="flex items-center gap-2 mb-1">
        <Headphones className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
        <span className="font-medium truncate">
          {t("apps.karaoke.liveListen.djLabel")}: @{session.djUsername}
        </span>
        <span className="text-gray-400 text-[10px] flex items-center gap-1 ml-auto flex-shrink-0">
          <Users className="w-3 h-3" />
          {session.listenerCount}
        </span>
      </div>
      {session.currentTrackMeta ? (
        <div className="flex items-center gap-1.5 text-gray-500 pl-5">
          <MusicNote className="w-3 h-3 flex-shrink-0" />
          <span className="truncate text-[10px]">
            {session.currentTrackMeta.title}
            {session.currentTrackMeta.artist &&
              ` - ${session.currentTrackMeta.artist}`}
          </span>
          {session.isPlaying && (
            <span className="text-green-500 text-[9px] ml-auto flex-shrink-0">
              ▶
            </span>
          )}
        </div>
      ) : (
        <div className="text-gray-400 text-[10px] pl-5">
          {t("apps.karaoke.liveListen.idle")}
        </div>
      )}
    </button>
  );
}

export function JoinSessionDialog({
  isOpen,
  onClose,
  onJoin,
}: JoinSessionDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [sessions, setSessions] = useState<ListenSessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentTheme = useThemeStore((state) => state.current);
  const fetchSessions = useListenSessionStore((state) => state.fetchSessions);

  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOsxTheme = currentTheme === "macosx";

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const result = await fetchSessions();
    if (result.ok && result.sessions) {
      setSessions(result.sessions);
    } else {
      setError(result.error || "Failed to load sessions");
    }
    setIsLoading(false);
  }, [fetchSessions]);

  useEffect(() => {
    if (isOpen) {
      loadSessions();
    }
  }, [isOpen, loadSessions]);

  const handleJoin = (sessionId?: string) => {
    const id = sessionId || extractSessionId(value);
    if (!id) return;
    onJoin(id);
    setValue("");
    onClose();
  };

  const dialogContent = (
    <div className={isXpTheme ? "p-2 px-4" : "p-3"}>
      {/* Session List Section */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <span
            className={cn(
              "text-gray-600 font-medium",
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
            {t("apps.karaoke.liveListen.activeSessions")}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadSessions}
            disabled={isLoading}
            className={cn(
              "h-6 px-2",
              isXpTheme
                ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[10px]"
                : "font-geneva-12 text-[10px]"
            )}
            style={{
              fontFamily: isXpTheme
                ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                : undefined,
              fontSize: isXpTheme ? "10px" : undefined,
            }}
          >
            <ArrowsClockwise
              className={cn("w-3 h-3 mr-1", isLoading && "animate-spin")}
            />
            {t("apps.karaoke.liveListen.refreshSessions")}
          </Button>
        </div>

        <ScrollArea className="h-[140px] border rounded bg-white dark:bg-gray-900">
          <div className="p-1">
            {isLoading ? (
              <div
                className={cn(
                  "text-center text-gray-400 py-8",
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
                  "text-center text-red-500 py-8",
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
                  "text-center text-gray-400 py-8",
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
              <div className="space-y-1">
                {sessions.map((session) => (
                  <SessionListItem
                    key={session.id}
                    session={session}
                    onJoin={handleJoin}
                    isXpTheme={isXpTheme}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Manual Entry Section */}
      <div className="border-t pt-3 mt-3">
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
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                handleJoin();
              }
            }}
            placeholder={t("apps.karaoke.liveListen.sessionLinkPlaceholder")}
            className={cn(
              "shadow-none h-8 flex-1",
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
            variant={isMacOsxTheme ? "default" : "retro"}
            onClick={() => handleJoin()}
            disabled={!value.trim()}
            className={cn(
              !isMacOsxTheme && "h-8",
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
      </div>
    </div>
  );

  if (isXpTheme) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className="p-0 overflow-hidden max-w-sm border-0"
          style={{ fontSize: "11px" }}
          onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
        >
          <div
            className="title-bar"
            style={currentTheme === "xp" ? { minHeight: "30px" } : undefined}
          >
            <div className="title-bar-text">
              {t("apps.karaoke.liveListen.joinSession")}
            </div>
            <div className="title-bar-controls">
              <button aria-label="Close" data-action="close" onClick={onClose} />
            </div>
          </div>
          <div className="window-body">{dialogContent}</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="bg-os-window-bg border-[length:var(--os-metrics-border-width)] border-os-window rounded-os shadow-os-window max-w-sm"
        onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
      >
        {isMacOsxTheme ? (
          <>
            <DialogHeader>
              {t("apps.karaoke.liveListen.joinSession")}
            </DialogHeader>
            <DialogDescription className="sr-only">
              {t("apps.karaoke.liveListen.pasteLinkOrId")}
            </DialogDescription>
          </>
        ) : (
          <DialogHeader>
            <DialogTitle className="font-normal text-[13px]">
              {t("apps.karaoke.liveListen.joinSession")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("apps.karaoke.liveListen.pasteLinkOrId")}
            </DialogDescription>
          </DialogHeader>
        )}
        {dialogContent}
      </DialogContent>
    </Dialog>
  );
}
