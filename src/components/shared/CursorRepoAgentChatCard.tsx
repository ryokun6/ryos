import { ArrowSquareOut, ArrowUp, Check } from "@phosphor-icons/react";
import {
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  CursorRunEventView,
  MergedAssistantStreamBlock,
  MergedEvTextStreamBlock,
  MergedThinkingStreamBlock,
  MergedToolCallStreamBlock,
  MergedUserStreamBlock,
} from "@/components/shared/CursorRunEventView";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { coalesceCursorRunRows } from "@/lib/cursorSdkRunCoalesce";
import { cn } from "@/lib/utils";
import {
  cursorAgentCardHeaderClassName,
  toolInlineCardShellClassName,
} from "@/components/shared/toolInlineCardShell";
import { CursorBrandMark } from "@/components/shared/CursorBrandMark";
import { useCursorAgentRunPoll } from "@/components/shared/useCursorAgentRunPoll";

interface CursorRepoAgentChatCardProps {
  runId: string;
  /** Banner title (agent catalog name or default i18n label) */
  headerTitle: string;
  /** Intro line shown above the card (outside applet chrome) */
  introMessage?: string;
  /** Admin side panel: fill parent height, no chat card chrome (margin/shadow/rounded). */
  variant?: "chat" | "panel";
}

/**
 * Cursor Cloud async tool: intro sits above the frame; banner shows resolved agent title + status badge;
 * body streams agent messages (HtmlPreview-like). When the run finishes, a follow-up input lets the user
 * keep talking to the same Cursor agent (resumed via `Agent.resume`), and a PR shortcut opens the
 * auto-generated pull request when one is available.
 */
export function CursorRepoAgentChatCard({
  runId,
  headerTitle,
  introMessage,
  variant = "chat",
}: CursorRepoAgentChatCardProps) {
  const isPanel = variant === "panel";
  const { t } = useTranslation();
  const { isMacOSTheme, isWindowsTheme, isSystem7Theme, isWin98, isDarkMode } =
    useThemeFlags();
  const {
    events,
    done,
    error,
    meta,
    metaAgentTitle,
    sendFollowup,
    isSendingFollowup,
    followupError,
  } = useCursorAgentRunPoll(runId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [followupDraft, setFollowupDraft] = useState("");

  const displayTitle =
    metaAgentTitle && metaAgentTitle.trim().length > 0
      ? metaAgentTitle.trim()
      : headerTitle;

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [events]);

  const prUrl = meta.prUrl;
  const canFollowup = done && !isSendingFollowup;
  const items = useMemo(
    () =>
      coalesceCursorRunRows(events).filter(
        (item) => item.kind !== "merged_status"
      ),
    [events]
  );

  const submitFollowup = useCallback(async () => {
    const text = followupDraft.trim();
    if (!text) return;
    setFollowupDraft("");
    await sendFollowup(text);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [followupDraft, sendFollowup]);

  const onTextareaKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (canFollowup) void submitFollowup();
      }
    },
    [canFollowup, submitFollowup]
  );

  return (
    <>
      {introMessage ? (
        <div className="mb-2 px-0.5">
          <div className="flex items-start gap-1 text-[12px] text-neutral-800 dark:text-neutral-200">
            <span className="inline-flex size-3 shrink-0 items-center justify-center pt-0.5">
              <Check
                className="size-3"
                style={{ color: "var(--os-accent-color, var(--os-color-selection-bg))" }}
                weight="bold"
              />
            </span>
            <span className="italic leading-snug">{introMessage}</span>
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          toolInlineCardShellClassName({
            isMacOSTheme,
            isSystem7Theme,
            isWindowsTheme,
            isWin98,
            embed: isPanel ? "panel" : "chat",
          }),
          isPanel &&
            "h-full min-h-0 rounded-none border-0 border-transparent !border-none shadow-none"
        )}
      >
        <div
          className={cursorAgentCardHeaderClassName({
            isMacOSTheme,
            isSystem7Theme,
            isWindowsTheme,
            isDarkMode,
          })}
        >
          <CursorBrandMark size={6} />
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div
              className={cn(
                "min-w-0 flex-1 truncate text-sm font-medium",
                isWindowsTheme && !isMacOSTheme
                  ? "text-white"
                  : "text-os-text-primary"
              )}
              title={displayTitle}
            >
              {displayTitle}
            </div>
            {prUrl ? (
              <a
                href={prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                  isMacOSTheme &&
                    "border-black/20 bg-white/70 hover:bg-white/90 dark:border-white/15 dark:bg-white/10 dark:hover:bg-white/16",
                  !isMacOSTheme &&
                    isWindowsTheme &&
                    "border-white/40 bg-white/20 text-white hover:bg-white/30",
                  !isMacOSTheme &&
                    !isWindowsTheme &&
                    "border-neutral-300 bg-white/85 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-900/70 dark:text-neutral-200 dark:hover:bg-neutral-800"
                )}
                title={prUrl}
                aria-label={t("apps.chats.toolCalls.cursorCloudAgent.openPr")}
              >
                <ArrowSquareOut className="size-3" weight="bold" />
                <span>
                  {t("apps.chats.toolCalls.cursorCloudAgent.openPr")}
                </span>
              </a>
            ) : null}
            {!done ? (
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 text-[10px] font-medium",
                  isWindowsTheme && !isMacOSTheme
                    ? "text-amber-100"
                    : "text-amber-900 dark:text-amber-200"
                )}
              >
                <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
                {t("apps.chats.toolCalls.cursorCloudAgent.running")}
              </span>
            ) : (
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 text-[10px] font-medium",
                  isWindowsTheme && !isMacOSTheme
                    ? "text-emerald-100"
                    : "text-emerald-900 dark:text-emerald-200"
                )}
              >
                <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
                {t("apps.chats.toolCalls.cursorCloudAgent.finished")}
              </span>
            )}
          </div>
        </div>

        <div
          className={cn(
            "flex flex-col",
            isPanel && "min-h-0 flex-1",
            isMacOSTheme
              ? isDarkMode
                ? "border-t border-[color:var(--os-color-separator)] bg-black/15"
                : "border-t border-black/10 bg-white/45"
              : "border-t border-black/10 bg-neutral-50/80 dark:border-neutral-600 dark:bg-neutral-900/40"
          )}
        >
          {error ? (
            <div className="border-b border-red-200/80 bg-red-50/90 px-3 py-1.5 text-[11px] text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </div>
          ) : null}
          <div
            ref={scrollRef}
            className={
              isPanel
                ? "min-h-0 flex-1 space-y-1 overflow-auto px-2 py-2 dark:bg-black/20"
                : "h-52 space-y-1 overflow-auto px-2 py-2 shadow-inner dark:bg-black/20"
            }
          >
            {items.length === 0 ? (
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                {t("apps.chats.toolCalls.cursorCloudAgent.noEventsYet")}
              </span>
            ) : (
              items.map((item, i) => {
                const key = `run-${i}`;
                switch (item.kind) {
                  case "merged_assistant":
                    return (
                      <MergedAssistantStreamBlock
                        key={key}
                        plainStream
                        tsStart={item.tsStart}
                        tsEnd={item.tsEnd}
                        segments={item.segments}
                      />
                    );
                  case "merged_thinking":
                    return (
                      <MergedThinkingStreamBlock
                        key={key}
                        plainStream
                        tsStart={item.tsStart}
                        tsEnd={item.tsEnd}
                        text={item.text}
                      />
                    );
                  case "merged_user":
                    return (
                      <MergedUserStreamBlock
                        key={key}
                        plainStream
                        tsStart={item.tsStart}
                        tsEnd={item.tsEnd}
                        text={item.text}
                      />
                    );
                  case "merged_ev_text":
                    return (
                      <MergedEvTextStreamBlock
                        key={key}
                        plainStream
                        tsStart={item.tsStart}
                        tsEnd={item.tsEnd}
                        evType={item.evType}
                        text={item.text}
                      />
                    );
                  case "merged_tool_call":
                    return (
                      <MergedToolCallStreamBlock
                        key={key}
                        plainStream
                        tsStart={item.tsStart}
                        tsEnd={item.tsEnd}
                        row={item.row}
                        rows={item.rows}
                      />
                    );
                  case "single":
                    return <CursorRunEventView key={key} plainStream row={item.row} />;
                }
              })
            )}
          </div>

          <div
            className={cn(
              "shrink-0 border-t px-2 py-1.5",
              isMacOSTheme
                ? isDarkMode
                  ? "border-[color:var(--os-color-separator)] bg-black/20"
                  : "border-black/10 bg-white/55"
                : "border-neutral-200 bg-white/80 dark:border-neutral-700 dark:bg-neutral-900/60"
            )}
          >
            {followupError ? (
              <div className="mb-1 text-[10px] text-red-700 dark:text-red-300">
                {followupError}
              </div>
            ) : null}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (canFollowup) void submitFollowup();
              }}
              className="flex items-stretch gap-1"
            >
              <textarea
                ref={inputRef}
                value={followupDraft}
                onChange={(e) => setFollowupDraft(e.target.value)}
                onKeyDown={onTextareaKeyDown}
                rows={1}
                disabled={!canFollowup}
                placeholder={
                  isSendingFollowup
                    ? t(
                        "apps.chats.toolCalls.cursorCloudAgent.followupSending"
                      )
                    : !done
                      ? t(
                          "apps.chats.toolCalls.cursorCloudAgent.followupBusy"
                        )
                      : t(
                          "apps.chats.toolCalls.cursorCloudAgent.followupPlaceholder"
                        )
                }
                aria-label={t(
                  "apps.chats.toolCalls.cursorCloudAgent.followupAriaLabel"
                )}
                className="min-h-[26px] flex-1 resize-none rounded border border-neutral-300 bg-white px-2 py-1 text-[12px] leading-snug text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:disabled:bg-neutral-900"
              />
              <button
                type="submit"
                disabled={!canFollowup || followupDraft.trim().length === 0}
                aria-label={t(
                  "apps.chats.toolCalls.cursorCloudAgent.followupSend"
                )}
                title={t(
                  "apps.chats.toolCalls.cursorCloudAgent.followupSend"
                )}
                className="inline-flex size-[26px] shrink-0 items-center justify-center self-end rounded border border-blue-500 bg-blue-500 text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-200 disabled:text-neutral-500 dark:disabled:border-neutral-700 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-500"
              >
                <ArrowUp className="size-3.5" weight="bold" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
