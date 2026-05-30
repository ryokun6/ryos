/**
 * Cursor Cloud agent dashboard URLs and chat preview helpers.
 * Used to render compact cards and suppress duplicate generic link previews.
 */

import type { ToolInvocationPart } from "@/components/shared/ToolInvocationMessage";

export const CURSOR_AGENT_DASHBOARD_ORIGIN = "https://cursor.com";

/** Agent id segment in https://cursor.com/agents/{id} */
const AGENT_PATH_RE = /^\/agents\/([^/?#]+)\/?$/i;

export function cursorAgentDashboardUrl(agentId: string): string {
  const id = agentId.trim();
  return `${CURSOR_AGENT_DASHBOARD_ORIGIN}/agents/${encodeURIComponent(id)}`;
}

export function parseCursorAgentDashboardUrl(url: string): string | null {
  const raw = url.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    if (parsed.hostname.replace(/^www\./i, "") !== "cursor.com") return null;
    const match = AGENT_PATH_RE.exec(parsed.pathname);
    if (!match?.[1]) return null;
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function isCursorAgentDashboardUrl(url: string): boolean {
  return parseCursorAgentDashboardUrl(url) !== null;
}

export function normalizeCursorAgentDashboardUrl(url: string): string | null {
  const agentId = parseCursorAgentDashboardUrl(url);
  return agentId ? cursorAgentDashboardUrl(agentId) : null;
}

export interface CursorAgentRunPreviewData {
  runId?: string;
  agentId?: string;
  agentDashboardUrl?: string;
  agentTitle?: string;
  status?: string;
  createdAt?: number | null;
  updatedAt?: number | null;
  promptPreview?: string;
  summaryPreview?: string;
  errorPreview?: string;
  prUrl?: string;
}

function dashboardUrlFromRow(row: CursorAgentRunPreviewData): string | undefined {
  const fromField = row.agentDashboardUrl?.trim();
  if (fromField) return fromField;
  const id = row.agentId?.trim();
  return id ? cursorAgentDashboardUrl(id) : undefined;
}

export interface CursorAgentChatCoverage {
  /** Normalized dashboard URLs already shown by a dedicated card */
  dashboardUrls: Set<string>;
  /** Agent ids (same agents as dashboardUrls) */
  agentIds: Set<string>;
  /** Run ids tied to a live stream card */
  runIds: Set<string>;
}

function addDashboardCoverage(
  coverage: CursorAgentChatCoverage,
  agentId?: string,
  agentDashboardUrl?: string
): void {
  const id = agentId?.trim();
  const url =
    agentDashboardUrl?.trim() ||
    (id ? cursorAgentDashboardUrl(id) : undefined);
  if (url) {
    const normalized = normalizeCursorAgentDashboardUrl(url) ?? url;
    coverage.dashboardUrls.add(normalized);
  }
  if (id) coverage.agentIds.add(id);
}

export function collectCursorAgentCoverageFromParts(
  parts: Array<ToolInvocationPart | { type: string; text?: string }> | undefined
): CursorAgentChatCoverage {
  const coverage: CursorAgentChatCoverage = {
    dashboardUrls: new Set(),
    agentIds: new Set(),
    runIds: new Set(),
  };
  if (!parts) return coverage;

  for (const part of parts) {
    if (!part.type.startsWith("tool-")) continue;
    const toolName = part.type.slice(5);
    const toolPart = part as ToolInvocationPart;
    if (toolPart.state !== "output-available") continue;
    const output = toolPart.output;
    if (!output || typeof output !== "object") continue;

    if (toolName === "cursorCloudAgent") {
      const o = output as {
        async?: boolean;
        runId?: string;
        agentId?: string;
        agentDashboardUrl?: string;
      };
      if (o.async && typeof o.runId === "string") {
        coverage.runIds.add(o.runId);
      }
      addDashboardCoverage(coverage, o.agentId, o.agentDashboardUrl);
      continue;
    }

    if (toolName === "listCursorCloudAgentRuns") {
      const o = output as { runs?: CursorAgentRunPreviewData[] };
      if (!Array.isArray(o.runs)) continue;
      for (const run of o.runs) {
        if (typeof run.runId === "string") coverage.runIds.add(run.runId);
        addDashboardCoverage(
          coverage,
          run.agentId,
          dashboardUrlFromRow(run)
        );
      }
    }
  }

  return coverage;
}

export function isCursorAgentUrlCoveredByMessage(
  url: string,
  coverage: CursorAgentChatCoverage
): boolean {
  const normalized = normalizeCursorAgentDashboardUrl(url);
  if (normalized && coverage.dashboardUrls.has(normalized)) return true;
  const agentId = parseCursorAgentDashboardUrl(url);
  return agentId != null && coverage.agentIds.has(agentId);
}

export function partitionMessageUrlsForPreviews(urls: string[]): {
  genericUrls: string[];
  cursorAgentUrls: string[];
} {
  const genericUrls: string[] = [];
  const cursorAgentUrls: string[] = [];
  const seenCursor = new Set<string>();

  for (const url of urls) {
    if (isCursorAgentDashboardUrl(url)) {
      const key = normalizeCursorAgentDashboardUrl(url) ?? url;
      if (!seenCursor.has(key)) {
        seenCursor.add(key);
        cursorAgentUrls.push(url);
      }
    } else {
      genericUrls.push(url);
    }
  }
  return { genericUrls, cursorAgentUrls };
}

export function formatCursorAgentTimestamp(
  ms: number | null | undefined,
  locale?: string
): string {
  if (ms == null || !Number.isFinite(ms)) return "";
  try {
    return new Date(ms).toLocaleString(locale, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export type CursorAgentStatusTone = "running" | "finished" | "error" | "unknown";

export function cursorAgentStatusTone(status: string | undefined): CursorAgentStatusTone {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "running") return "running";
  if (s === "finished" || s === "completed" || s === "success") return "finished";
  if (
    s === "error" ||
    s === "failed" ||
    s === "cancelled" ||
    s === "canceled"
  ) {
    return "error";
  }
  return "unknown";
}

export function cursorAgentDisplayTitle(row: CursorAgentRunPreviewData): string {
  const title = row.agentTitle?.trim();
  if (title) return title;
  const prompt = row.promptPreview?.trim();
  if (prompt) {
    return prompt.length > 80 ? `${prompt.slice(0, 77)}…` : prompt;
  }
  return "";
}

export function cursorAgentDisplaySummary(row: CursorAgentRunPreviewData): string {
  const summary = row.summaryPreview?.trim();
  if (summary) return summary;
  const err = row.errorPreview?.trim();
  if (err) return err;
  return "";
}

export function parseListCursorCloudAgentRunsOutput(
  output: unknown
): CursorAgentRunPreviewData[] {
  if (!output || typeof output !== "object") return [];
  const o = output as { success?: boolean; runs?: unknown[] };
  if (o.success === false || !Array.isArray(o.runs)) return [];
  return o.runs.filter(
    (r): r is CursorAgentRunPreviewData =>
      typeof r === "object" && r !== null && typeof (r as { runId?: unknown }).runId === "string"
  );
}
