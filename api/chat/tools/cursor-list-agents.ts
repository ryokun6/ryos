/**
 * Read-only inspection of recent Cursor Cloud agents / runs via @cursor/sdk
 * (Agent.list → Agent.get / Agent.listRuns → Agent.getRun), matching Cursor's
 * Cloud Agents API model: durable agents with per-prompt runs.
 *
 * API limitation (see Cloud Agents docs): there is no global "list all runs"
 * endpoint — runs are listed per agent. This tool therefore walks recent agents
 * (newest first) and attaches each agent's latest run (+ fresh status from getRun).
 * SDK-started agents may be hidden from default UI lists but still appear in
 * Agent.list when includeArchived / filters allow.
 */

import { z } from "zod";
import type { MemoryToolContext } from "./executors.js";
import {
  CURSOR_REPO_AGENT_OWNER,
  DEFAULT_RYOS_GITHUB_REPO_URL,
} from "./cursor-repo-agent.js";

export const listRecentCursorAgentsSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum number of runs to return (default 10)."),
  status: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "Optional run status filter (e.g. RUNNING, FINISHED). Case-insensitive."
    ),
});

export type ListRecentCursorAgentsInput = z.infer<
  typeof listRecentCursorAgentsSchema
>;

export const LIST_RECENT_CURSOR_AGENTS_DESCRIPTION =
  "List recent Cursor Cloud agents and their latest run status for the configured GitHub repo (default ryokun6/ryos). Read-only: does not start agents. Uses CURSOR_API_KEY. Use when the user asks about recent Cursor background agents, cloud runs, or PR bot activity.";

/** Normalized for comparing Cursor repo URLs to env/default. */
function repoKeyFromUrl(url: string): string {
  try {
    const u = url.trim().toLowerCase().replace(/\.git$/, "");
    const noProto = u.replace(/^https?:\/\//, "");
    if (noProto.startsWith("github.com/")) {
      return noProto.slice("github.com/".length).replace(/\/+$/, "");
    }
    return noProto.replace(/\/+$/, "");
  } catch {
    return url.trim().toLowerCase();
  }
}

function agentRelatesToRepo(
  repos: string[] | undefined,
  targetKey: string
): { matches: boolean; indeterminate: boolean } {
  if (!repos || repos.length === 0) {
    return { matches: true, indeterminate: true };
  }
  for (const r of repos) {
    if (repoKeyFromUrl(r) === targetKey) {
      return { matches: true, indeterminate: false };
    }
  }
  return { matches: false, indeterminate: false };
}

function truncatePreview(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function firstLine(s: string): string {
  const line = s.split(/\r?\n/).find((l) => l.trim().length > 0);
  return (line ?? s).trim();
}

/** Map SDK / API run.status to cloud-style labels (REST uses SCREAMING_SNAKE). */
function normalizeRunStatusForOutput(
  status: string | undefined
): string | undefined {
  if (!status) return undefined;
  const u = status.toUpperCase();
  if (u === "RUNNING") return "RUNNING";
  if (u === "FINISHED") return "FINISHED";
  if (u === "ERROR") return "ERROR";
  if (u === "CANCELLED" || u === "CANCELED") return "CANCELLED";
  if (u === "CREATING") return "CREATING";
  if (u === "EXPIRED") return "EXPIRED";
  return u;
}

export interface ListRecentCursorAgentsRow {
  id: string;
  agentId?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string;
  model?: string;
  promptPreview?: string;
  branch?: string;
  commit?: string;
  prUrl?: string;
  url?: string;
  summary?: string;
}

export type ListRecentCursorAgentsToolOutput =
  | {
      ok: true;
      runs: ListRecentCursorAgentsRow[];
      repoFilter: string;
      /** Present when some agents had no repo metadata in the API — rows may include non-repo agents. */
      repoFilterIndeterminate?: boolean;
      truncated?: boolean;
    }
  | { ok: false; error: string };

export interface ListRecentCursorAgentsContext extends MemoryToolContext {
  apiKey: string;
}

const MAX_AGENT_LIST_PAGES = 8;
const AGENTS_PAGE_SIZE = 20;
const MAX_RUNS_PER_AGENT = 5;

export async function executeListRecentCursorAgents(
  input: ListRecentCursorAgentsInput,
  context: ListRecentCursorAgentsContext
): Promise<ListRecentCursorAgentsToolOutput> {
  if (context.username !== CURSOR_REPO_AGENT_OWNER) {
    return {
      ok: false,
      error: "This tool is restricted to the owner account.",
    };
  }

  const key = context.apiKey?.trim();
  if (!key) {
    return {
      ok: false,
      error:
        "Cursor API key is not configured. Set CURSOR_API_KEY in the server environment (Cursor Dashboard → Integrations).",
    };
  }

  const limit = Math.min(100, Math.max(1, input.limit ?? 10));
  const statusFilterRaw = input.status?.trim();
  const statusFilter = statusFilterRaw
    ? statusFilterRaw.toUpperCase()
    : undefined;

  const repoUrl =
    process.env.CURSOR_CLOUD_REPO_URL?.trim() || DEFAULT_RYOS_GITHUB_REPO_URL;
  const repoKey = repoKeyFromUrl(repoUrl);

  try {
    const { Agent } = await import("@cursor/sdk");

    type SdkAgentInfo = Awaited<
      ReturnType<typeof Agent.list>
    >["items"][number];

    type AgentGetExtras = {
      latestRunId?: string;
      branchName?: string;
      url?: string;
    };

    const runs: ListRecentCursorAgentsRow[] = [];
    let listCursor: string | undefined;
    let listPages = 0;
    let indeterminateRepo = false;
    let truncated = false;

    outer: while (runs.length < limit && listPages < MAX_AGENT_LIST_PAGES) {
      listPages += 1;
      const page = await Agent.list({
        runtime: "cloud",
        apiKey: key,
        limit: AGENTS_PAGE_SIZE,
        ...(listCursor ? { cursor: listCursor } : {}),
      });

      for (const item of page.items) {
        if (runs.length >= limit) {
          truncated = page.nextCursor !== undefined;
          break outer;
        }

        const aid = item.agentId;
        if (!aid.startsWith("bc-")) continue;

        let info: SdkAgentInfo = item;
        try {
          info = await Agent.get(aid, { apiKey: key });
        } catch {
          info = item;
        }

        const repos = info.runtime === "cloud" ? info.repos : undefined;
        const { matches, indeterminate } = agentRelatesToRepo(repos, repoKey);
        if (indeterminate) indeterminateRepo = true;
        if (!matches) continue;

        const extras = info as SdkAgentInfo & AgentGetExtras;
        let runId =
          typeof extras.latestRunId === "string" ? extras.latestRunId : undefined;

        if (!runId) {
          try {
            const runPage = await Agent.listRuns(aid, {
              runtime: "cloud",
              apiKey: key,
              limit: MAX_RUNS_PER_AGENT,
            });
            runId = runPage.items[0]?.id;
          } catch {
            runId = undefined;
          }
        }

        if (!runId) {
          if (statusFilter) continue;
          const name = typeof info.name === "string" ? info.name : "";
          const st = normalizeRunStatusForOutput(info.status);
          runs.push({
            id: `agent:${aid}`,
            agentId: aid,
            ...(info.createdAt != null
              ? { createdAt: new Date(info.createdAt).toISOString() }
              : {}),
            ...(info.lastModified != null
              ? { updatedAt: new Date(info.lastModified).toISOString() }
              : {}),
            ...(st ? { status: st } : {}),
            ...(name
              ? { promptPreview: truncatePreview(firstLine(name), 280) }
              : {}),
            ...(typeof info.summary === "string" && info.summary.trim()
              ? {
                  summary: truncatePreview(firstLine(info.summary), 500),
                }
              : {}),
            url: `https://cursor.com/agents?id=${encodeURIComponent(aid)}`,
          });
          continue;
        }

        let run: Awaited<ReturnType<typeof Agent.getRun>>;
        try {
          run = await Agent.getRun(runId, {
            runtime: "cloud",
            agentId: aid,
            apiKey: key,
          });
        } catch {
          continue;
        }

        const normStatus = normalizeRunStatusForOutput(run.status);
        if (statusFilter && normStatus !== statusFilter) continue;

        const name = typeof info.name === "string" ? info.name : "";
        const summary =
          typeof info.summary === "string" && info.summary.trim()
            ? truncatePreview(firstLine(info.summary), 500)
            : run.result
              ? truncatePreview(run.result, 500)
              : undefined;

        const modelId = run.model?.id;
        const gitBranch = run.git?.branches?.[0];
        let branch = gitBranch?.branch;
        const prUrl = gitBranch?.prUrl;
        if (!branch && typeof extras.branchName === "string") {
          branch = extras.branchName;
        }

        const row: ListRecentCursorAgentsRow = {
          id: run.id,
          agentId: run.agentId,
          ...(run.createdAt != null
            ? { createdAt: new Date(run.createdAt).toISOString() }
            : {}),
          ...(normStatus ? { status: normStatus } : {}),
          ...(modelId ? { model: modelId } : {}),
          ...(name
            ? { promptPreview: truncatePreview(firstLine(name), 280) }
            : {}),
          ...(branch ? { branch } : {}),
          ...(prUrl ? { prUrl } : {}),
          url: `https://cursor.com/agents?id=${encodeURIComponent(aid)}`,
          ...(summary ? { summary } : {}),
        };
        runs.push(row);
      }

      listCursor = page.nextCursor;
      if (!listCursor) break;
    }

    if (listPages >= MAX_AGENT_LIST_PAGES && listCursor !== undefined) {
      truncated = true;
    }

    return {
      ok: true,
      runs,
      repoFilter: repoKey,
      ...(indeterminateRepo ? { repoFilterIndeterminate: true } : {}),
      ...(truncated ? { truncated: true } : {}),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const lower = msg.toLowerCase();
    if (
      lower.includes("401") ||
      lower.includes("unauthorized") ||
      lower.includes("authentication") ||
      lower.includes("api key")
    ) {
      return {
        ok: false,
        error:
          "Cursor API rejected the request (check CURSOR_API_KEY is valid and not expired).",
      };
    }
    if (
      lower.includes("network") ||
      lower.includes("econnreset") ||
      lower.includes("fetch failed") ||
      lower.includes("503") ||
      lower.includes("502") ||
      lower.includes("504")
    ) {
      return {
        ok: false,
        error:
          "Cursor Cloud is temporarily unreachable. Retry in a moment.",
      };
    }
    return {
      ok: false,
      error: `Cursor API error: ${msg}`,
    };
  }
}
