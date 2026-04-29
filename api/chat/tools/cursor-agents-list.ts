/**
 * Cursor SDK (@cursor/sdk) — list Cursor Cloud agents and runs against the
 * authenticated CURSOR_API_KEY workspace.
 *
 * Owner-gated: this tool is scoped to the same account as `cursorRyOsRepoAgent`
 * because it surfaces agents/runs across the entire Cursor Cloud workspace.
 */

import { z } from "zod";
import type { MemoryToolContext } from "./executors.js";
import { CURSOR_REPO_AGENT_OWNER } from "./cursor-repo-agent.js";

export const CURSOR_AGENTS_LIST_DESCRIPTION =
  "List Cursor Cloud agents (and their runs) on the authenticated CURSOR_API_KEY workspace. " +
  "Use when the user asks 'what Cursor agents are done / running', 'show my recent Cursor runs', " +
  "or wants to follow up on background work spawned by `cursorRyOsRepoAgent`. " +
  "Actions: 'listAgents' returns recent agents (filterable by status: running/finished/error or archived); " +
  "'listRuns' returns recent runs for a given agentId. " +
  "Status reflects the most recent run for each agent. Status filtering happens after the page is " +
  "fetched, so use 'limit' generously (up to 50) when filtering. The agent's `url` is included so the " +
  "user can open it in Cursor's web dashboard.";

const STATUS_FILTERS = [
  "any",
  "running",
  "finished",
  "error",
  "cancelled",
] as const;

export const cursorAgentsListSchema = z
  .object({
    action: z
      .enum(["listAgents", "listRuns"])
      .default("listAgents")
      .describe(
        "What to list: 'listAgents' (default) returns Cursor Cloud agents on the workspace; " +
          "'listRuns' returns the runs for one agent (requires 'agentId')."
      ),
    agentId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        "For 'listRuns' (required): the Cursor agent id (e.g. 'bc-…') whose runs to list."
      ),
    status: z
      .enum(STATUS_FILTERS)
      .default("any")
      .describe(
        "Optional status filter applied client-side. " +
          "'any' (default) returns everything; otherwise only items whose latest status matches " +
          "(e.g. 'finished' for done agents, 'running' for in-flight)."
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .describe(
        "Max items to return per page (1-50, default 10). When filtering by status, set this higher " +
          "since the filter is applied after the page is fetched."
      ),
    includeArchived: z
      .boolean()
      .default(false)
      .describe(
        "For 'listAgents': include archived agents in the result. Default false."
      ),
    prUrl: z
      .string()
      .url()
      .max(2000)
      .optional()
      .describe(
        "For 'listAgents': narrow results to agents associated with the given GitHub PR URL."
      ),
    cursor: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .optional()
      .describe(
        "Pagination cursor returned as `nextCursor` from a previous call. Omit for the first page."
      ),
  })
  .superRefine((data, ctx) => {
    if (data.action === "listRuns" && !data.agentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The 'listRuns' action requires the 'agentId' parameter.",
        path: ["agentId"],
      });
    }
  });

export type CursorAgentsListInput = z.infer<typeof cursorAgentsListSchema>;

export interface CursorAgentsListContext extends MemoryToolContext {
  apiKey: string;
}

export interface CursorAgentSummary {
  agentId: string;
  name?: string;
  summary?: string;
  /** Latest run status, when available. */
  status?: "running" | "finished" | "error";
  archived?: boolean;
  createdAt?: number;
  lastModified?: number;
  repos?: string[];
  /** Cursor.com URL for the agent (when derivable from the agent id). */
  url?: string;
}

export interface CursorRunSummary {
  id: string;
  agentId: string;
  status: "running" | "finished" | "error" | "cancelled";
  durationMs?: number;
  /** First line of the agent's final result (truncated for display), when present. */
  resultPreview?: string;
  /** Branch / PR info from the run, when available. */
  git?: {
    branches: Array<{
      repoUrl: string;
      branch?: string;
      prUrl?: string;
    }>;
  };
  createdAt?: number;
}

export type CursorAgentsListOutput =
  | {
      success: true;
      action: "listAgents";
      message: string;
      agents: CursorAgentSummary[];
      nextCursor?: string;
      filtered?: { status: (typeof STATUS_FILTERS)[number]; total: number };
    }
  | {
      success: true;
      action: "listRuns";
      message: string;
      agentId: string;
      runs: CursorRunSummary[];
      nextCursor?: string;
      filtered?: { status: (typeof STATUS_FILTERS)[number]; total: number };
    }
  | {
      success: false;
      action: "listAgents" | "listRuns";
      error: string;
    };

const RESULT_PREVIEW_MAX_CHARS = 280;

function truncatePreview(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0);
  const candidate = (firstLine ?? text).trim();
  if (candidate.length === 0) return undefined;
  if (candidate.length <= RESULT_PREVIEW_MAX_CHARS) return candidate;
  return `${candidate.slice(0, RESULT_PREVIEW_MAX_CHARS - 1)}…`;
}

/**
 * Cursor cloud agent ids look like `bc-<uuid>`. The web dashboard renders them
 * at /agents?id=<id>. We expose a best-effort URL so the user can click through.
 */
function cursorAgentWebUrl(agentId: string): string | undefined {
  if (!agentId || !agentId.startsWith("bc-")) return undefined;
  return `https://cursor.com/agents?id=${encodeURIComponent(agentId)}`;
}

export async function executeCursorAgentsList(
  input: CursorAgentsListInput,
  context: CursorAgentsListContext
): Promise<CursorAgentsListOutput> {
  const action = input.action;

  if (context.username !== CURSOR_REPO_AGENT_OWNER) {
    context.log("[cursorAgentsList] denied: not owner account");
    return {
      success: false,
      action,
      error: "This tool is restricted to the owner account.",
    };
  }

  context.log(
    `[cursorAgentsList] action=${action} status=${input.status} limit=${input.limit} includeArchived=${input.includeArchived} agentId=${input.agentId ?? "-"}`
  );

  try {
    const { Agent } = await import("@cursor/sdk");

    if (action === "listAgents") {
      const result = await Agent.list({
        runtime: "cloud",
        limit: input.limit,
        ...(input.cursor ? { cursor: input.cursor } : {}),
        ...(input.prUrl ? { prUrl: input.prUrl } : {}),
        includeArchived: input.includeArchived,
        apiKey: context.apiKey,
      });

      const allAgents = result.items.map<CursorAgentSummary>((agent) => {
        const repos =
          agent.runtime === "cloud" && Array.isArray(agent.repos)
            ? agent.repos.slice()
            : undefined;
        const url = cursorAgentWebUrl(agent.agentId);
        return {
          agentId: agent.agentId,
          ...(agent.name?.trim() ? { name: agent.name.trim() } : {}),
          ...(agent.summary?.trim() ? { summary: agent.summary.trim() } : {}),
          ...(agent.status ? { status: agent.status } : {}),
          ...(typeof agent.archived === "boolean"
            ? { archived: agent.archived }
            : {}),
          ...(agent.createdAt !== undefined
            ? { createdAt: agent.createdAt }
            : {}),
          ...(agent.lastModified !== undefined
            ? { lastModified: agent.lastModified }
            : {}),
          ...(repos ? { repos } : {}),
          ...(url ? { url } : {}),
        };
      });

      const filterStatus = input.status;
      const filtered =
        filterStatus === "any"
          ? allAgents
          : allAgents.filter((agent) => agent.status === filterStatus);

      const showingAll = filterStatus === "any";
      const totalLabel = `${filtered.length} agent${filtered.length === 1 ? "" : "s"}`;
      const message = showingAll
        ? filtered.length === 0
          ? "No Cursor Cloud agents on this workspace."
          : `Found ${totalLabel} on this workspace.`
        : filtered.length === 0
          ? `No Cursor Cloud agents matched status '${filterStatus}'.`
          : `Found ${totalLabel} with status '${filterStatus}'.`;

      return {
        success: true,
        action: "listAgents",
        message,
        agents: filtered,
        ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
        ...(showingAll
          ? {}
          : { filtered: { status: filterStatus, total: allAgents.length } }),
      };
    }

    const agentId = input.agentId!.trim();
    const result = await Agent.listRuns(agentId, {
      runtime: "cloud",
      limit: input.limit,
      ...(input.cursor ? { cursor: input.cursor } : {}),
      apiKey: context.apiKey,
    });

    const allRuns = result.items.map<CursorRunSummary>((run) => ({
      id: run.id,
      agentId: run.agentId,
      status: run.status,
      ...(run.durationMs !== undefined ? { durationMs: run.durationMs } : {}),
      ...(run.result
        ? { resultPreview: truncatePreview(run.result) ?? "" }
        : {}),
      ...(run.git ? { git: run.git } : {}),
      ...(run.createdAt !== undefined ? { createdAt: run.createdAt } : {}),
    }));

    const filterStatus = input.status;
    const filteredRuns =
      filterStatus === "any"
        ? allRuns
        : allRuns.filter((run) => run.status === filterStatus);

    const totalLabel = `${filteredRuns.length} run${filteredRuns.length === 1 ? "" : "s"}`;
    const message =
      filterStatus === "any"
        ? filteredRuns.length === 0
          ? `No runs found for agent ${agentId}.`
          : `Found ${totalLabel} for agent ${agentId}.`
        : filteredRuns.length === 0
          ? `No runs matched status '${filterStatus}' for agent ${agentId}.`
          : `Found ${totalLabel} with status '${filterStatus}' for agent ${agentId}.`;

    return {
      success: true,
      action: "listRuns",
      message,
      agentId,
      runs: filteredRuns,
      ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
      ...(filterStatus === "any"
        ? {}
        : { filtered: { status: filterStatus, total: allRuns.length } }),
    };
  } catch (error) {
    context.logError("[cursorAgentsList] failed", error);
    const message =
      error instanceof Error ? error.message : String(error);
    return {
      success: false,
      action,
      error: message,
    };
  }
}
