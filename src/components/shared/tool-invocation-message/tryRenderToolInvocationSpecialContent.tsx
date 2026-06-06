import { Check } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import HtmlPreview from "@/components/shared/HtmlPreview";
import {
  CursorCloudAgentRunsListCard,
  type CursorCloudAgentRunListRow,
} from "@/components/shared/CursorCloudAgentRunsListCard";
import { CursorRepoAgentChatCard } from "@/components/shared/CursorRepoAgentChatCard";
import {
  MapsSearchPlacesCard,
  type MapsSearchPlaceCardData,
} from "@/components/shared/MapsSearchPlacesCard";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { ToolInvocationStatusRow } from "./ToolInvocationStatusRow";
import type { ToolInvocationMessageProps, ToolInvocationPart } from "./types";

export type ToolInvocationSpecialRenderProps = Pick<
  ToolInvocationMessageProps,
  | "partKey"
  | "setIsInteractingWithPreview"
  | "playElevatorMusic"
  | "stopElevatorMusic"
  | "playDingSound"
  | "formatToolName"
> & {
  toolName: string;
  state: ToolInvocationPart["state"];
  input?: ToolInvocationPart["input"];
  output?: unknown;
  t: ReturnType<typeof useTranslation>["t"];
};

export function tryRenderToolInvocationSpecialContent(
  props: ToolInvocationSpecialRenderProps
): ReactNode | null {
  const {
    toolName,
    state,
    input,
    output,
    partKey,
    t,
    formatToolName,
    setIsInteractingWithPreview,
    playElevatorMusic,
    stopElevatorMusic,
    playDingSound,
  } = props;

  // Async Cursor Cloud agent — server streams events to Redis; UI polls /api/ai/cursor-run-status
  if (
    state === "output-available" &&
    toolName === "cursorCloudAgent" &&
    output &&
    typeof output === "object" &&
    "async" in output &&
    (output as { async?: boolean }).async === true &&
    typeof (output as { runId?: string }).runId === "string"
  ) {
    const out = output as {
      async: boolean;
      runId: string;
      agentId?: string;
      agentTitle?: string;
      message?: string;
    };
    const headerTitle =
      typeof out.agentTitle === "string" && out.agentTitle.trim().length > 0
        ? out.agentTitle.trim()
        : t("apps.chats.toolCalls.cursorCloudAgent.panelTitle");

    return (
      <CursorRepoAgentChatCard
        key={partKey}
        runId={out.runId}
        headerTitle={headerTitle}
        introMessage={out.message}
      />
    );
  }

  if (state === "output-available" && toolName === "listCursorCloudAgentRuns") {
    const out = output as
      | {
          success?: boolean;
          runs?: CursorCloudAgentRunListRow[];
          truncated?: boolean;
          error?: string;
        }
      | undefined;
    if (out && out.success === true && Array.isArray(out.runs)) {
      const runs = out.runs;
      const more = out.truncated
        ? ` ${t("apps.chats.toolCalls.listCursorCloudAgentRuns.truncatedHint")}`
        : "";
      return (
        <div key={partKey} className="mb-0 px-1 py-0.5 text-[12px]">
          <ToolInvocationStatusRow
            icon={
              <Check
                className="size-3"
                style={{ color: "var(--os-accent-color, var(--os-color-selection-bg))" }}
                weight="bold"
              />
            }
            className="text-neutral-700 dark:text-neutral-200"
            align="start"
          >
            <span>
              {`${t("apps.chats.toolCalls.listCursorCloudAgentRuns.listed", {
                count: runs.length,
              })}${more}`}
            </span>
          </ToolInvocationStatusRow>
          {runs.length > 0 ? (
            <CursorCloudAgentRunsListCard runs={runs} />
          ) : null}
        </div>
      );
    }
  }

  // Special handling for mapsSearchPlaces — render a rich place-card list
  if (state === "output-available" && toolName === "mapsSearchPlaces") {
    const out = output as
      | {
          success?: boolean;
          query?: string;
          results?: MapsSearchPlaceCardData[];
          message?: string;
        }
      | undefined;
    if (out && out.success !== false) {
      const query =
        typeof out.query === "string"
          ? out.query
          : typeof input?.query === "string"
            ? input.query
            : "";
      const results = Array.isArray(out.results) ? out.results : [];
      return (
        <div key={partKey} className="mb-0 px-1 py-0.5 text-[12px]">
          <ToolInvocationStatusRow
            icon={
              <Check
                className="size-3"
                style={{ color: "var(--os-accent-color, var(--os-color-selection-bg))" }}
                weight="bold"
              />
            }
            className="text-neutral-700 dark:text-neutral-200"
            align="start"
          >
            <span>
              {results.length === 0
                ? t("apps.chats.toolCalls.maps.noResults", {
                    defaultValue: 'No places found for "{{query}}".',
                    query,
                  })
                : results.length === 1
                  ? t("apps.chats.toolCalls.maps.foundOne", {
                      defaultValue: 'Found 1 place for "{{query}}".',
                      query,
                    })
                  : t("apps.chats.toolCalls.maps.foundMany", {
                      defaultValue: 'Found {{count}} places for "{{query}}".',
                      count: results.length,
                      query,
                    })}
            </span>
          </ToolInvocationStatusRow>
          {results.length > 0 && (
            <MapsSearchPlacesCard query={query} results={results} />
          )}
        </div>
      );
    }
    if (out && out.success === false) {
      return (
        <div key={partKey} className="mb-0 px-1 py-0.5 text-[12px]">
          <ToolInvocationStatusRow
            icon={
              <Check
                className="size-3 shrink-0 text-neutral-400 dark:text-neutral-500"
                weight="bold"
                aria-hidden
              />
            }
            className="text-neutral-500 dark:text-neutral-400"
            align="start"
          >
            <span>
              {t("apps.chats.toolCalls.toolAttempted", {
                toolName: formatToolName(toolName),
              })}
            </span>
          </ToolInvocationStatusRow>
        </div>
      );
    }
  }

  // Special handling for generateHtml
  if (state === "output-available" && toolName === "generateHtml") {
    // Handle both old format (string) and new format (object with html, title, and icon)
    let htmlContent = "";
    let appletTitle = "";
    let appletIcon = "";

    if (typeof output === "string" && output.trim().length > 0) {
      htmlContent = output;
    } else if (
      typeof output === "object" &&
      output !== null &&
      "html" in output
    ) {
      htmlContent = (output as { html: string; title?: string; icon?: string })
        .html;
      appletTitle =
        (output as { html: string; title?: string; icon?: string }).title || "";
      appletIcon =
        (output as { html: string; title?: string; icon?: string }).icon || "";
    }

    if (htmlContent.trim().length > 0) {
      return (
        <HtmlPreview
          key={partKey}
          htmlContent={htmlContent}
          appletTitle={appletTitle}
          appletIcon={appletIcon}
          onInteractionChange={setIsInteractingWithPreview}
          playElevatorMusic={playElevatorMusic}
          stopElevatorMusic={stopElevatorMusic}
          playDingSound={playDingSound}
          className="my-1"
          // AI tool output is generated by the trusted assistant ("ryo"),
          // so it gets the same-origin sandbox + auth bridge.
          appletCreatedBy="ryo"
        />
      );
    }
  }

  if (toolName === "generateHtml") {
    const htmlContent = typeof input?.html === "string" ? input.html : "";
    const appletTitle = typeof input?.title === "string" ? input.title : "";
    const appletIcon = typeof input?.icon === "string" ? input.icon : "";

    if (state === "input-streaming") {
      // Show HTML preview with streaming if HTML content is available
      if (htmlContent) {
        return (
          <HtmlPreview
            key={partKey}
            htmlContent={htmlContent}
            appletTitle={appletTitle}
            appletIcon={appletIcon}
            isStreaming={true}
            minWidth="320px"
            onInteractionChange={setIsInteractingWithPreview}
            playElevatorMusic={playElevatorMusic}
            stopElevatorMusic={stopElevatorMusic}
            playDingSound={playDingSound}
            className="my-1"
            appletCreatedBy="ryo"
          />
        );
      }
      // Show loading state if HTML not yet available
      return (
        <div key={partKey} className="mb-0 px-1 py-0.5 italic text-[12px]">
          <ToolInvocationStatusRow
            icon={<ActivityIndicator size="xs" className="text-neutral-500 dark:text-neutral-400" />}
            className="text-neutral-600 dark:text-neutral-300"
          >
            <span className="shimmer">
              {t("apps.chats.toolCalls.generating")}
            </span>
          </ToolInvocationStatusRow>
        </div>
      );
    } else if (state === "input-available") {
      if (htmlContent) {
        return (
          <HtmlPreview
            key={partKey}
            htmlContent={htmlContent}
            appletTitle={appletTitle}
            appletIcon={appletIcon}
            isStreaming={false}
            onInteractionChange={setIsInteractingWithPreview}
            playElevatorMusic={playElevatorMusic}
            stopElevatorMusic={stopElevatorMusic}
            playDingSound={playDingSound}
            className="my-1"
            appletCreatedBy="ryo"
          />
        );
      }
      return (
        <div key={partKey} className="mb-0 px-1 py-0.5 italic text-[12px]">
          <ToolInvocationStatusRow
            icon={<ActivityIndicator size="xs" className="text-neutral-500 dark:text-neutral-400" />}
            className="text-neutral-500 dark:text-neutral-400"
          >
            <span>{t("apps.chats.toolCalls.preparingHtmlPreview")}</span>
          </ToolInvocationStatusRow>
        </div>
      );
    }
  }
  return null;
}
