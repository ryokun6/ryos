import { Check } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  CursorRunEventView,
  MergedAssistantStreamBlock,
  MergedEvTextStreamBlock,
  MergedThinkingStreamBlock,
  MergedToolCallStreamBlock,
  MergedUserStreamBlock,
} from "@/components/shared/CursorRunEventView";
import { coalesceCursorRunRows } from "@/lib/cursorSdkRunCoalesce";
import { useCursorAgentRunPoll } from "@/components/shared/useCursorAgentRunPoll";

interface CursorAgentRunCardProps {
  runId: string;
  /** Banner title (agent catalog name or default i18n label) */
  headerTitle: string;
  /** Intro line shown above the card (outside applet chrome) */
  introMessage?: string;
}

/**
 * Cursor Cloud async run card for `cursorAgentStart`: intro sits above the
 * frame; banner shows resolved agent title + status badge; body streams agent
 * messages (HtmlPreview-like).
 */
export function CursorAgentRunCard({
  runId,
  headerTitle,
  introMessage,
}: CursorAgentRunCardProps) {
  const { t } = useTranslation();
  const { events, done, error, metaAgentTitle } = useCursorAgentRunPoll(runId);
  const scrollRef = useRef<HTMLDivElement>(null);

  const displayTitle =
    metaAgentTitle && metaAgentTitle.trim().length > 0
      ? metaAgentTitle.trim()
      : headerTitle;

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [events]);

  return (
    <>
      {introMessage ? (
        <div className="mb-2 px-0.5">
          <div className="flex items-start gap-1 text-[12px] text-neutral-800 dark:text-neutral-200">
            <span className="inline-flex h-3 w-3 shrink-0 items-center justify-center pt-0.5">
              <Check className="h-3 w-3 text-blue-600 dark:text-blue-400" weight="bold" />
            </span>
            <span className="italic leading-snug">{introMessage}</span>
          </div>
        </div>
      ) : null}

      <div
        className="my-1 flex flex-col overflow-hidden rounded bg-white font-geneva-12 dark:bg-neutral-950"
        style={{ boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.3)" }}
      >
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-gray-300 bg-gray-100 px-3 py-2 dark:border-neutral-600 dark:bg-neutral-800/90">
          <span className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center" aria-hidden>
            <img
              src="/brands/cursor-cube-2d-light.svg"
              alt=""
              width={24}
              height={24}
              className="h-6 w-6 dark:hidden"
              draggable={false}
            />
            <img
              src="/brands/cursor-cube-2d-dark.svg"
              alt=""
              width={24}
              height={24}
              className="hidden h-6 w-6 dark:block"
              draggable={false}
            />
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="min-w-0 flex-1 truncate text-sm font-medium" title={displayTitle}>
              {displayTitle}
            </div>
            {!done ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-amber-900 dark:text-amber-200">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
                {t("apps.chats.toolCalls.cursorAgentStart.running")}
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-emerald-900 dark:text-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                {t("apps.chats.toolCalls.cursorAgentStart.finished")}
              </span>
            )}
          </div>
        </div>

        <div className="border-t border-gray-200 bg-neutral-50/50 dark:border-neutral-600 dark:bg-neutral-900/40">
          {error ? (
            <div className="border-b border-red-200/80 bg-red-50/90 px-3 py-1.5 text-[11px] text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </div>
          ) : null}
          <div
            ref={scrollRef}
            className="h-52 space-y-1 overflow-auto px-2 py-2 shadow-inner dark:bg-black/20"
          >
            {events.length === 0 ? (
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                {t("apps.chats.toolCalls.cursorAgentStart.noEventsYet")}
              </span>
            ) : (
              coalesceCursorRunRows(events)
                .filter((item) => item.kind !== "merged_status")
                .map((item, i) => {
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
        </div>
      </div>
    </>
  );
}
