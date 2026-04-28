import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useThemeStore } from "@/stores/useThemeStore";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";
import { useTvStore } from "@/stores/useTvStore";
import type { Video } from "@/stores/useVideoStore";

interface CreateChannelResponse {
  name: string;
  description: string;
  queries: string[];
  videos: Video[];
}

interface CreateChannelDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new channel id once it's been added; usually tunes-in. */
  onChannelCreated?: (channelId: string) => void;
}

type DialogStage = "idle" | "loading" | "error";

const SUGGESTIONS = [
  "Skateboarding tricks and parks",
  "80s synthwave music",
  "Classic standup comedy specials",
  "Cute cat compilations",
  "Cooking street food",
  "Lofi study beats",
];

export function CreateChannelDialog({
  isOpen,
  onOpenChange,
  onChannelCreated,
}: CreateChannelDialogProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((s) => s.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacTheme = currentTheme === "macosx";

  const addCustomChannel = useTvStore((s) => s.addCustomChannel);

  const [description, setDescription] = useState("");
  const [stage, setStage] = useState<DialogStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>("");

  // Cycle status messages so the loading state feels alive during the
  // ~5-15s round-trip (AI plan + 2-4 YouTube searches).
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (stage !== "loading") {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }
      return;
    }
    const messages = [
      t("apps.tv.create.statusPlanning"),
      t("apps.tv.create.statusSearching"),
      t("apps.tv.create.statusTuning"),
    ];
    let i = 0;
    setStatusText(messages[0]);
    statusIntervalRef.current = setInterval(() => {
      i = (i + 1) % messages.length;
      setStatusText(messages[i]);
    }, 1800);
    return () => {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }
    };
  }, [stage, t]);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setStage("idle");
    }
  }, [isOpen]);

  const isLoading = stage === "loading";

  const handleSubmit = async () => {
    const trimmed = description.trim();
    if (!trimmed) {
      setError(t("apps.tv.create.errorEmpty"));
      return;
    }

    setError(null);
    setStage("loading");

    try {
      const response = await abortableFetch(
        getApiUrl("/api/tv/create-channel"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: trimmed }),
          // AI plan + several YouTube searches; allow generous time before
          // surfacing a timeout error to the user.
          timeout: 45000,
          throwOnHttpError: false,
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const msg =
          response.status === 429
            ? t("apps.tv.create.errorRateLimit")
            : data?.error || t("apps.tv.create.errorGeneric");
        throw new Error(msg);
      }

      const data = (await response.json()) as CreateChannelResponse;
      if (!data?.videos?.length) {
        throw new Error(t("apps.tv.create.errorNoVideos"));
      }

      const created = addCustomChannel({
        name: data.name,
        description: data.description,
        videos: data.videos,
        prompt: trimmed,
        queries: data.queries,
      });

      setDescription("");
      onOpenChange(false);
      onChannelCreated?.(created.id);
    } catch (err) {
      console.error("Create channel failed:", err);
      setError(
        err instanceof Error ? err.message : t("apps.tv.create.errorGeneric")
      );
      setStage("error");
    }
  };

  const fontStyle = isXpTheme
    ? { fontFamily: '"Pixelated MS Sans Serif", "ArkPixel", Arial' as const, fontSize: "11px" }
    : undefined;
  const fontClass = isXpTheme
    ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
    : "font-geneva-12 text-[12px]";

  const dialogContent = (
    <div className={cn(isXpTheme ? "p-2 px-4" : "p-4 px-6")}>
      <p className={cn("text-gray-500 mb-2", fontClass)} style={fontStyle}>
        {t("apps.tv.create.description")}
      </p>

      <Input
        autoFocus
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter" && !isLoading) handleSubmit();
        }}
        placeholder={t("apps.tv.create.placeholder")}
        disabled={isLoading}
        className={cn("shadow-none", fontClass)}
        style={fontStyle}
      />

      <div className={cn("mt-2 flex flex-wrap gap-1", fontClass)} style={fontStyle}>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={isLoading}
            onClick={() => setDescription(s)}
            className={cn(
              "px-2 py-0.5 rounded-full border text-gray-700",
              "border-gray-300 hover:bg-gray-100 disabled:opacity-50"
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading && (
        <p
          className={cn("mt-3 shimmer-gray", fontClass)}
          style={fontStyle}
          aria-live="polite"
        >
          {statusText}
        </p>
      )}
      {error && stage !== "loading" && (
        <p className="text-red-600 text-sm mt-3">{error}</p>
      )}

      <DialogFooter className="mt-4 gap-1 sm:justify-end">
        <Button
          variant={isMacTheme ? "secondary" : "retro"}
          onClick={() => onOpenChange(false)}
          disabled={isLoading}
          className={cn("w-full sm:w-auto", !isMacTheme && "h-7", fontClass)}
          style={fontStyle}
        >
          {t("common.dialog.cancel")}
        </Button>
        <Button
          variant={isMacTheme ? "default" : "retro"}
          onClick={handleSubmit}
          disabled={isLoading}
          className={cn("w-full sm:w-auto", !isMacTheme && "h-7", fontClass)}
          style={fontStyle}
        >
          {isLoading
            ? t("apps.tv.create.creating")
            : t("apps.tv.create.submit")}
        </Button>
      </DialogFooter>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={isLoading ? undefined : onOpenChange}>
      <DialogContent
        className={cn("max-w-[500px]", isXpTheme && "p-0 overflow-hidden")}
        style={isXpTheme ? { fontSize: "11px" } : undefined}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {isXpTheme ? (
          <>
            <DialogHeader>{t("apps.tv.create.title")}</DialogHeader>
            <div className="window-body">{dialogContent}</div>
          </>
        ) : isMacTheme ? (
          <>
            <DialogHeader>{t("apps.tv.create.title")}</DialogHeader>
            {dialogContent}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-normal text-[16px]">
                {t("apps.tv.create.title")}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t("apps.tv.create.description")}
              </DialogDescription>
            </DialogHeader>
            {dialogContent}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
