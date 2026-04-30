/**
 * Cursor Cloud Agents — list recent runs for chat inspection.
 *
 * Uses the public Cloud Agents API v1: GET https://api.cursor.com/v1/agents
 * (basic auth with CURSOR_API_KEY). List responses include latestRunId;
 * we call GET /v1/agents/{id}/runs/{runId} per agent for run status/timestamps.
 *
 * Note: Runs created only via the legacy @cursor/sdk path may not appear here
 * until Cursor reconciles them with the v1 API; this tool still lists what the
 * REST API returns for the authenticated key.
 */

import { z } from "zod";
import type { MemoryToolContext } from "./executors.js";
import {
  CURSOR_REPO_AGENT_OWNER,
  DEFAULT_RYOS_GITHUB_REPO_URL,
} from "./cursor-repo-agent.js";

const CURSOR_API_BASE =
  process.env.CURSOR_API_BASE_URL?.trim() || "https://api.cursor.com";

export const listRecentCursorAgentsSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Max agents to return (default 10, API max 100)."),
  status: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .optional()
    .describe(
      "Optional case-insensitive filter on agent status (e.g. ACTIVE) or latest run status (e.g. RUNNING, FINISHED)."
    ),
});

export type ListRecentCursorAgentsInput = z.infer<
  typeof listRecentCursorAgentsSchema
>;

export const LIST_RECENT_CURSOR_AGENTS_DESCRIPTION =
  "List recent Cursor Cloud agents and their latest run status for the GitHub repo ryokun6/ryos (read-only). Use when the user asks for recent Cursor cloud runs, agent status, or what is running—without starting a new run.";

/** UI-safe structured row for the model */
export interface RecentCursorAgentRunRow {
  id: string;
  agentId: string;
  createdAt?: string;
  updatedAt?: string;
  status: string;
  model?: string;
  promptPreview?: string;
  branch?: string;
  startingRef?: string;
  repoUrl?: string;
  url?: string;
  summary?: string;
}

interface ListAgentsApiItem {
  id?: string;
  name?: string;
  status?: string;
  env?: { type?: string };
  url?: string;
  createdAt?: string;
  updatedAt?: string;
  latestRunId?: string;
}

interface GetAgentApiResponse {
  id?: string;
  name?: string;
  status?: string;
  url?: string;
  createdAt?: string;
  updatedAt?: string;
  latestRunId?: string;
  repos?: Array<{ url?: string; startingRef?: string }>;
  branchName?: string;
}

interface GetRunApiResponse {
  id?: string;
  agentId?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

function normalizeRyosRepoUrl(): string {
  return (
    process.env.CURSOR_CLOUD_REPO_URL?.trim() || DEFAULT_RYOS_GITHUB_REPO_URL
  );
}

/** Normalize to lowercase `owner/repo` when parsable as GitHub. Exported for repo-matching tests. */
export function githubRepoSlug(urlRaw: string): string | undefined {
  const u = urlRaw.trim().toLowerCase().replace(/\.git$/, "");
  try {
    const withScheme = /^https?:\/\//i.test(u) ? u : `https://${u}`;
    const parsed = new URL(withScheme);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && parsed.hostname.includes("github.com")) {
      return `${parts[0]}/${parts[1]}`;
    }
    return parts.length >= 2 ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}` : undefined;
  } catch {
    return undefined;
  }
}

function repoMatchesConfigured(
  repos: Array<{ url?: string }> | undefined,
  configured: string
): boolean {
  if (!repos?.length) return false;
  const target = githubRepoSlug(configured);
  if (!target) return false;
  for (const r of repos) {
    const u = typeof r.url === "string" ? r.url : "";
    const slug = githubRepoSlug(u);
    if (slug && slug === target) return true;
  }
  return false;
}

function previewPrompt(name: string | undefined, maxLen: number): string | undefined {
  if (!name || typeof name !== "string") return undefined;
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) return undefined;
  return trimmed.length <= maxLen ? trimmed : `${trimmed.slice(0, maxLen - 1)}…`;
}

function basicAuthHeader(apiKey: string): string {
  const token = `${apiKey}:`;
  return `Basic ${Buffer.from(token, "utf8").toString("base64")}`;
}

async function cursorApiJson<T>(
  pathWithQuery: string,
  apiKey: string,
  logError: (...args: unknown[]) => void
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const url = `${CURSOR_API_BASE.replace(/\/$/, "")}${pathWithQuery}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: basicAuthHeader(apiKey),
        Accept: "application/json",
      },
    });
    const text = await res.text();
    if (!res.ok) {
      let message = text.slice(0, 200).trim();
      if (message.startsWith("{")) {
        try {
          const j = JSON.parse(message) as { message?: string; error?: string };
          message =
            typeof j.message === "string"
              ? j.message
              : typeof j.error === "string"
                ? j.error
                : message;
        } catch {
          /* keep raw snippet */
        }
      }
      if (!message) message = `HTTP ${res.status}`;
      return { ok: false, status: res.status, message };
    }
    try {
      return { ok: true, data: JSON.parse(text) as T };
    } catch {
      logError("[listRecentCursorAgents] invalid JSON from Cursor API");
      return { ok: false, status: res.status, message: "Invalid JSON response" };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, message: msg };
  }
}

export type ListRecentCursorAgentsSuccess = {
  ok: true;
  source: "cursor_cloud_api_v1";
  repoFilter: string;
  items: RecentCursorAgentRunRow[];
};

export type ListRecentCursorAgentsFailure = {
  ok: false;
  error: string;
  hint?: string;
};

export type ListRecentCursorAgentsOutput =
  | ListRecentCursorAgentsSuccess
  | ListRecentCursorAgentsFailure;

export async function executeListRecentCursorAgents(
  input: ListRecentCursorAgentsInput,
  context: MemoryToolContext & { apiKey: string }
): Promise<ListRecentCursorAgentsOutput> {
  if (context.username !== CURSOR_REPO_AGENT_OWNER) {
    return {
      ok: false,
      error: "This tool is restricted to the owner account.",
    };
  }

  const apiKey = context.apiKey?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: "CURSOR_API_KEY is not configured on the server.",
      hint: "Add a Cursor API key (Dashboard → Integrations) to the deployment environment.",
    };
  }

  const limit =
    typeof input.limit === "number"
      ? Math.min(Math.max(input.limit, 1), 100)
      : 10;
  const configuredRepo = normalizeRyosRepoUrl();
  const statusFilterRaw = input.status?.trim();
  const statusFilter = statusFilterRaw?.toLowerCase();

  context.log?.(
    `[listRecentCursorAgents] limit=${limit}${statusFilter ? ` status=${statusFilterRaw}` : ""}`
  );

  /** Ask the API with a comfortable page size, then paginate until we have enough ryos-repo rows. */
  const pageSize = Math.min(Math.max(limit * 4, 20), 100);
  let listCursor: string | null | undefined;
  let listFailedFirstPage:
    | { status: number; message: string; isUnreachable: boolean; isUnauthorized: boolean }
    | undefined;
  const maxProbePages = 8;

  const rows: RecentCursorAgentRunRow[] = [];

  for (
    let page = 0;
    page < maxProbePages && rows.length < limit;
    page++
  ) {
    const q = new URLSearchParams({
      limit: String(pageSize),
      includeArchived: "true",
    });
    if (listCursor) q.set("cursor", listCursor);
    const listed = await cursorApiJson<{
      items?: ListAgentsApiItem[];
      nextCursor?: string | null;
    }>(`/v1/agents?${q.toString()}`, apiKey, context.logError || (() => {}));

    if (!listed.ok) {
      if (page === 0) {
        listFailedFirstPage = {
          status: listed.status,
          message: listed.message,
          isUnreachable: listed.status === 0,
          isUnauthorized: listed.status === 401,
        };
      }
      break;
    }

    const batch = Array.isArray(listed.data.items) ? listed.data.items : [];
    listCursor =
      typeof listed.data.nextCursor === "string" &&
      listed.data.nextCursor.length > 0
        ? listed.data.nextCursor
        : null;

    for (const summary of batch) {
      const agentId = summary.id;
      const latestRunId = summary.latestRunId;
      if (typeof agentId !== "string" || !agentId) continue;

      const detail = await cursorApiJson<GetAgentApiResponse>(
        `/v1/agents/${encodeURIComponent(agentId)}`,
        apiKey,
        context.logError || (() => {})
      );

      if (!detail.ok) {
        context.log?.(
          `[listRecentCursorAgents] skip agent ${agentId}: detail fetch failed`
        );
        continue;
      }

      if (!repoMatchesConfigured(detail.data.repos, configuredRepo)) {
        continue;
      }

      let run: GetRunApiResponse | undefined;
      if (typeof latestRunId === "string" && latestRunId.length > 0) {
        const runRes = await cursorApiJson<{ id?: string; status?: string }>(
          `/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(latestRunId)}`,
          apiKey,
          context.logError || (() => {})
        );
        if (runRes.ok) {
          run = runRes.data as GetRunApiResponse;
        }
      }

      const agentStatus =
        typeof detail.data.status === "string" ? detail.data.status : "UNKNOWN";
      const runStatus =
        typeof run?.status === "string" ? run.status : "UNKNOWN";
      const name =
        typeof detail.data.name === "string"
          ? detail.data.name
          : typeof summary.name === "string"
            ? summary.name
            : undefined;

      if (statusFilter) {
        const agentMatch = agentStatus.toLowerCase() === statusFilter;
        const runMatch = runStatus.toLowerCase() === statusFilter;
        if (!agentMatch && !runMatch) continue;
      }

      const repo0 = detail.data.repos?.[0];
      const row: RecentCursorAgentRunRow = {
        id:
          typeof run?.id === "string"
            ? run.id
            : typeof latestRunId === "string"
              ? latestRunId
              : agentId,
        agentId,
        status: typeof run?.status === "string" ? run.status : agentStatus,
        createdAt:
          typeof run?.createdAt === "string"
            ? run.createdAt
            : typeof detail.data.createdAt === "string"
              ? detail.data.createdAt
              : undefined,
        updatedAt:
          typeof run?.updatedAt === "string"
            ? run.updatedAt
            : typeof detail.data.updatedAt === "string"
              ? detail.data.updatedAt
              : undefined,
        ...(typeof repo0?.url === "string" ? { repoUrl: repo0.url } : {}),
        ...(typeof repo0?.startingRef === "string"
          ? { startingRef: repo0.startingRef }
          : {}),
        ...(typeof detail.data.branchName === "string"
          ? { branch: detail.data.branchName }
          : {}),
        url:
          typeof detail.data.url === "string"
            ? detail.data.url
            : typeof summary.url === "string"
              ? summary.url
              : undefined,
        promptPreview: previewPrompt(name, 280),
        summary:
          previewPrompt(name, 400) ??
          (agentStatus !== runStatus ? `Agent ${agentStatus}` : undefined),
      };

      rows.push(row);
      if (rows.length >= limit) break;
    }

    if (!listCursor || batch.length === 0) break;
  }

  if (rows.length === 0 && listFailedFirstPage) {
    const f = listFailedFirstPage;
    return {
      ok: false,
      error: f.isUnreachable
        ? "Could not reach the Cursor Cloud API."
        : f.isUnauthorized
          ? "Cursor API rejected credentials."
          : `Cursor API error (${f.status}).`,
      hint: f.isUnreachable
        ? "Check network connectivity and retry; if outages persist, use the Cursor dashboard."
        : f.isUnauthorized
          ? "Verify CURSOR_API_KEY is valid and has Cloud Agents API access."
          : f.message || undefined,
    };
  }

  return {
    ok: true,
    source: "cursor_cloud_api_v1",
    repoFilter: configuredRepo,
    items: rows,
  };
}
