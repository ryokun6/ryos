/**
 * Cursor SDK (@cursor/sdk) — Cursor Cloud Agents against ryokun6/ryos.
 * Async mode (Redis): starts run and returns immediately; events stream to Redis for polling.
 * Fallback (no Redis): blocking Agent.prompt (legacy).
 */

import type { Redis } from "../../_utils/redis.js";
import { z } from "zod";
import type { MemoryToolContext } from "./executors.js";
import { sendTelegramMessage } from "../../_utils/telegram.js";

export const CURSOR_REPO_AGENT_OWNER = "ryo";

export const CURSOR_SDK_RUN_TTL_SEC = 86_400;

/** Redis key prefixes — keep in sync with api/ai/cursor-run-status.ts */
export function cursorSdkEventsKey(runId: string): string {
  return `cursor-sdk-run:${runId}:events`;
}

export function cursorSdkMetaKey(runId: string): string {
  return `cursor-sdk-run:${runId}:meta`;
}

/** Tracks the latest run for a given Cursor agent so follow-ups can resume it. */
export function cursorSdkAgentLatestRunKey(agentId: string): string {
  return `cursor-sdk-agent:${agentId}:latestRun`;
}

/** Best-effort PR URL extractor for `Run.git.branches[]`. */
export function pickPrUrlFromRunGit(git: unknown): string | undefined {
  if (!git || typeof git !== "object") return undefined;
  const branches = (git as { branches?: unknown }).branches;
  if (!Array.isArray(branches)) return undefined;
  for (const b of branches) {
    if (b && typeof b === "object") {
      const url = (b as { prUrl?: unknown }).prUrl;
      if (typeof url === "string" && url.length > 0) return url;
    }
  }
  return undefined;
}

/** Default repo for ryOS Cursor Cloud runs (override with CURSOR_CLOUD_REPO_URL). */
export const DEFAULT_RYOS_GITHUB_REPO_URL = "https://github.com/ryokun6/ryos";

/** Shown to the model when this tool is enabled */
export const CURSOR_RYOS_REPO_AGENT_DESCRIPTION =
  "Run Cursor's coding agent in Cursor Cloud against the GitHub repo ryokun6/ryos (not the browser VFS). Use when the user asks to implement, debug, or refactor the real ryOS product codebase—not virtual paths like /Documents or /Applets (those use read/write/edit). Give clear instructions and desired outcomes. Uses CURSOR_API_KEY and Cursor SDK billing. The run is asynchronous: you get an immediate acknowledgment while work continues, and the user is notified when it completes (live stream in web chat, follow-up message on Telegram). The chat card exposes a reply input that resumes the same Cursor agent for follow-up turns and a button that opens the auto-created GitHub PR.";

export const cursorRyOsRepoAgentSchema = z.object({
  prompt: z
    .string()
    .min(1)
    .max(32000)
    .describe(
      "Concrete instructions for the Cursor coding agent: what to change in the ryOS codebase, acceptance criteria, and constraints."
    ),
  modelId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "Optional model id (default composer-2). Use Cursor.models from dashboard-valid IDs."
    ),
});

export type CursorRyOsRepoAgentInput = z.infer<typeof cursorRyOsRepoAgentSchema>;

export interface CursorRepoAgentTelegramNotify {
  botToken: string;
  chatId: string;
  /** Optional: message to reply-to (typically the user message that started the run). */
  replyToMessageId?: number;
}

export interface CursorRyOsRepoAgentContext extends MemoryToolContext {
  apiKey: string;
  /** When set, send a Telegram message to this chat once the run terminates. */
  notifyTelegram?: CursorRepoAgentTelegramNotify;
}

const TELEGRAM_NOTIFY_MAX_BODY_CHARS = 3500;

export function formatCursorRunCompletionTelegramMessage(input: {
  ok: boolean;
  agentTitle?: string;
  status?: string;
  summary?: string;
  error?: string;
}): string {
  const { ok, agentTitle, status, summary, error } = input;
  const titleSuffix = agentTitle ? ` — ${agentTitle}` : "";
  const headline = ok
    ? `Cursor agent done${titleSuffix}`
    : `Cursor agent failed${titleSuffix}`;

  const rawBody = ok
    ? (summary?.trim() ?? "")
    : (error?.trim() || summary?.trim() || "");

  const fallback = ok
    ? `(no summary returned${status ? `, status: ${status}` : ""})`
    : status
      ? `failed: ${status}`
      : "failed";

  const body = rawBody.length > 0 ? rawBody : fallback;
  const truncated =
    body.length > TELEGRAM_NOTIFY_MAX_BODY_CHARS
      ? `${body.slice(0, TELEGRAM_NOTIFY_MAX_BODY_CHARS)}\n…(truncated)`
      : body;

  return `${headline}\n\n${truncated}`;
}

async function notifyTelegramRunComplete(
  notifyTelegram: CursorRepoAgentTelegramNotify | undefined,
  text: string,
  logError: (...args: unknown[]) => void
): Promise<void> {
  if (!notifyTelegram) return;
  try {
    await sendTelegramMessage({
      botToken: notifyTelegram.botToken,
      chatId: notifyTelegram.chatId,
      text,
    });
  } catch (err) {
    logError("[cursorRyOsRepoAgent] telegram notify failed", err);
  }
}

export type CursorRyOsRepoAgentToolOutput =
  | {
      async: true;
      runId: string;
      agentId: string;
      /** Cloud catalog display name when available (`Agent.get`) */
      agentTitle?: string;
      message: string;
      pollHint: string;
    }
  | {
      async?: false;
      success: boolean;
      summary?: string;
      status?: string;
      durationMs?: number;
      error?: string;
    };

async function safePushEvent(
  redis: Redis,
  eventsKey: string,
  payload: unknown
): Promise<void> {
  let line: string;
  try {
    line = JSON.stringify(payload);
  } catch {
    line = JSON.stringify({
      ts: Date.now(),
      error: "serialize_failed",
      payload: String(payload),
    });
  }
  await redis.lpush(eventsKey, line);
  await redis.expire(eventsKey, CURSOR_SDK_RUN_TTL_SEC);
}

async function executeBlockingPrompt(
  input: CursorRyOsRepoAgentInput,
  context: CursorRyOsRepoAgentContext,
  cloudOpts: {
    repoUrl: string;
    startingRef: string;
    autoCreatePR: boolean;
    modelId: string;
  }
): Promise<CursorRyOsRepoAgentToolOutput> {
  const { Agent } = await import("@cursor/sdk");
  const result = await Agent.prompt(input.prompt, {
    apiKey: context.apiKey,
    model: { id: cloudOpts.modelId },
    cloud: {
      repos: [{ url: cloudOpts.repoUrl, startingRef: cloudOpts.startingRef }],
      autoCreatePR: cloudOpts.autoCreatePR,
    },
  });

  const ok = result.status === "finished";
  return {
    success: ok,
    summary:
      result.result ??
      (ok ? "(no assistant text returned)" : `Run ended: ${result.status}`),
    status: result.status,
    durationMs: result.durationMs,
    ...(ok ? {} : { error: result.result || result.status }),
  };
}

interface BackgroundCursorRunInput {
  redis: Redis;
  runId: string;
  agentId: string;
  agentTitle?: string;
  username: string;
  eventsKey: string;
  metaKey: string;
  repoUrl?: string;
  startingRef?: string;
  modelId?: string;
  autoCreatePR?: boolean;
  /** PR URL inherited from a prior run (followups). Survives even if the SDK omits git on this run. */
  inheritedPrUrl?: string;
  /** Whether to dispose the agent after this run completes. Followups keep the agent open. */
  disposeAgentAfter?: boolean;
  log: (...args: unknown[]) => void;
  logError: (...args: unknown[]) => void;
  agent: import("@cursor/sdk").SDKAgent;
  run: import("@cursor/sdk").Run;
  notifyTelegram?: CursorRepoAgentTelegramNotify;
}

/** Read the run's existing meta (if any) so background updates merge instead of overwriting. */
async function readRunMeta(
  redis: Redis,
  metaKey: string
): Promise<Record<string, unknown> | null> {
  const raw = await redis.get(metaKey);
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function writeMergedMeta(
  redis: Redis,
  metaKey: string,
  patch: Record<string, unknown>,
  log: (...args: unknown[]) => void
): Promise<void> {
  const existing = await readRunMeta(redis, metaKey);
  const merged: Record<string, unknown> = { ...(existing ?? {}), ...patch };
  await redis.set(metaKey, JSON.stringify(merged), { ex: CURSOR_SDK_RUN_TTL_SEC });
  log("[cursorRyOsRepoAgent] meta updated", {
    metaKey,
    keys: Object.keys(merged),
  });
}

function spawnBackgroundCursorRun(input: BackgroundCursorRunInput): void {
  const {
    redis,
    eventsKey,
    metaKey,
    runId,
    agentId,
    agentTitle,
    username,
    repoUrl,
    startingRef,
    modelId,
    autoCreatePR,
    inheritedPrUrl,
    disposeAgentAfter = true,
    log,
    logError,
    agent,
    run,
    notifyTelegram,
  } = input;

  void (async () => {
    try {
      for await (const ev of run.stream()) {
        await safePushEvent(redis, eventsKey, { ts: Date.now(), ev });
      }

      let summary = "";
      let status = run.status;
      try {
        const awaited = await run.wait();
        summary = awaited.result ?? "";
        status = awaited.status;
      } catch (waitErr) {
        logError("[cursorRyOsRepoAgent] run.wait failed", waitErr);
      }

      const prUrl = pickPrUrlFromRunGit(run.git) ?? inheritedPrUrl;

      await safePushEvent(redis, eventsKey, {
        ts: Date.now(),
        type: "terminal",
        status,
        summary,
        durationMs: run.durationMs,
        git: run.git,
        ...(prUrl ? { prUrl } : {}),
      });

      await writeMergedMeta(
        redis,
        metaKey,
        {
          username,
          runId,
          agentId,
          ...(agentTitle ? { agentTitle } : {}),
          ...(repoUrl ? { repoUrl } : {}),
          ...(startingRef ? { startingRef } : {}),
          ...(modelId ? { modelId } : {}),
          ...(typeof autoCreatePR === "boolean" ? { autoCreatePR } : {}),
          ...(prUrl ? { prUrl } : {}),
          finishedAt: Date.now(),
          terminalStatus: status,
          summary,
          activeRunId: null,
        },
        log
      );

      await notifyTelegramRunComplete(
        notifyTelegram,
        formatCursorRunCompletionTelegramMessage({
          ok: status === "finished",
          agentTitle,
          status,
          summary,
        }),
        logError
      );
    } catch (e) {
      logError("[cursorRyOsRepoAgent] background run failed", e);
      const errorText = e instanceof Error ? e.message : String(e);
      await safePushEvent(redis, eventsKey, {
        ts: Date.now(),
        type: "terminal",
        status: "error",
        error: errorText,
      });
      await writeMergedMeta(
        redis,
        metaKey,
        {
          username,
          runId,
          agentId,
          ...(agentTitle ? { agentTitle } : {}),
          finishedAt: Date.now(),
          terminalStatus: "error",
          error: errorText,
          activeRunId: null,
        },
        log
      );

      await notifyTelegramRunComplete(
        notifyTelegram,
        formatCursorRunCompletionTelegramMessage({
          ok: false,
          agentTitle,
          status: "error",
          error: errorText,
        }),
        logError
      );
    } finally {
      if (disposeAgentAfter) {
        try {
          const dispose = agent[Symbol.asyncDispose];
          if (typeof dispose === "function") {
            await dispose.call(agent);
          }
        } catch (disposeErr) {
          logError("[cursorRyOsRepoAgent] agent dispose failed", disposeErr);
        }
      }
    }
  })();

  log("[cursorRyOsRepoAgent] background consumer spawned", { runId, agentId });
}

export async function executeCursorRyOsRepoAgent(
  input: CursorRyOsRepoAgentInput,
  context: CursorRyOsRepoAgentContext
): Promise<CursorRyOsRepoAgentToolOutput> {
  if (context.username !== CURSOR_REPO_AGENT_OWNER) {
    context.log("[cursorRyOsRepoAgent] denied: not owner account");
    return {
      success: false,
      error: "This tool is restricted to the owner account.",
    };
  }

  const modelId =
    input.modelId?.trim() ||
    process.env.CURSOR_SDK_MODEL?.trim() ||
    "composer-2";

  const repoUrl =
    process.env.CURSOR_CLOUD_REPO_URL?.trim() || DEFAULT_RYOS_GITHUB_REPO_URL;
  const startingRef =
    process.env.CURSOR_CLOUD_STARTING_REF?.trim() || "main";
  const autoCreatePREnv =
    process.env.CURSOR_CLOUD_AUTO_PR?.trim().toLowerCase();
  const autoCreatePR =
    autoCreatePREnv !== "0" &&
    autoCreatePREnv !== "false" &&
    autoCreatePREnv !== "off";

  context.log(
    `[cursorRyOsRepoAgent] repo=${repoUrl} ref=${startingRef} model=${modelId} autoCreatePR=${autoCreatePR}`
  );

  if (!context.redis) {
    context.log("[cursorRyOsRepoAgent] no Redis — falling back to blocking Agent.prompt");
    try {
      return await executeBlockingPrompt(input, context, {
        repoUrl,
        startingRef,
        autoCreatePR,
        modelId,
      });
    } catch (e) {
      context.logError("[cursorRyOsRepoAgent] Agent.prompt failed", e);
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  try {
    const { Agent } = await import("@cursor/sdk");
    const agent = await Agent.create({
      apiKey: context.apiKey,
      model: { id: modelId },
      cloud: {
        repos: [{ url: repoUrl, startingRef }],
        autoCreatePR,
      },
    });

    const run = await agent.send(input.prompt);
    const runId = run.id;
    const agentId = agent.agentId;

    let agentTitle: string | undefined;
    try {
      const info = await Agent.get(agentId, { apiKey: context.apiKey });
      const namePart = typeof info.name === "string" ? info.name.trim() : "";
      const summaryRaw =
        typeof info.summary === "string" ? info.summary.trim() : "";
      const summaryLine =
        summaryRaw.length > 0
          ? (summaryRaw.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "").trim()
          : "";
      const fromSummary =
        summaryLine.length > 0
          ? summaryLine.length > 96
            ? `${summaryLine.slice(0, 93)}…`
            : summaryLine
          : "";
      agentTitle = namePart || fromSummary || undefined;
    } catch (e) {
      context.log("[cursorRyOsRepoAgent] Agent.get (title) skipped", e);
    }

    const eventsKey = cursorSdkEventsKey(runId);
    const metaKey = cursorSdkMetaKey(runId);

    await context.redis.set(
      metaKey,
      JSON.stringify({
        username: context.username,
        runId,
        agentId,
        ...(agentTitle ? { agentTitle } : {}),
        repoUrl,
        startingRef,
        modelId,
        autoCreatePR,
        createdAt: Date.now(),
        promptPreview: input.prompt.slice(0, 280),
        activeRunId: runId,
      }),
      { ex: CURSOR_SDK_RUN_TTL_SEC }
    );

    await context.redis.set(
      cursorSdkAgentLatestRunKey(agentId),
      JSON.stringify({
        username: context.username,
        runId,
        ...(agentTitle ? { agentTitle } : {}),
      }),
      { ex: CURSOR_SDK_RUN_TTL_SEC }
    );

    spawnBackgroundCursorRun({
      repoUrl,
      startingRef,
      modelId,
      autoCreatePR,
      redis: context.redis,
      runId,
      agentId,
      agentTitle,
      username: context.username!,
      eventsKey,
      metaKey,
      log: context.log,
      logError: context.logError,
      agent,
      run,
      notifyTelegram: context.notifyTelegram,
    });

    return {
      async: true,
      runId,
      agentId,
      ...(agentTitle ? { agentTitle } : {}),
      message: "Cursor Cloud agent run started.",
      pollHint:
        "Poll GET /api/ai/cursor-run-status?runId=… for events until a terminal entry appears.",
    };
  } catch (e) {
    context.logError("[cursorRyOsRepoAgent] Agent.create/send failed", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export interface CursorAgentFollowupContext {
  apiKey: string;
  username: string;
  redis: Redis;
  log: (...args: unknown[]) => void;
  logError: (...args: unknown[]) => void;
  notifyTelegram?: CursorRepoAgentTelegramNotify;
}

export type CursorAgentFollowupResult =
  | {
      ok: true;
      runId: string;
      agentId: string;
      previousRunId: string;
      message: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

/**
 * Resume the Cursor agent that owns `previousRunId` and send a follow-up prompt.
 * The new run streams to Redis under a fresh runId; meta on the previous run is
 * left intact (terminal banner already rendered) and the previous-run meta gets
 * a `nextRunId` pointer so the chat card can chain into the new run.
 */
export async function sendCursorAgentFollowup(input: {
  previousRunId: string;
  prompt: string;
  context: CursorAgentFollowupContext;
}): Promise<CursorAgentFollowupResult> {
  const { previousRunId, prompt, context } = input;
  const { redis, apiKey, username, log, logError } = context;

  if (username !== CURSOR_REPO_AGENT_OWNER) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    return { ok: false, status: 400, error: "Prompt is required" };
  }
  if (prompt.length > 32_000) {
    return { ok: false, status: 400, error: "Prompt is too long" };
  }

  const prevMetaKey = cursorSdkMetaKey(previousRunId);
  const prevMeta = await readRunMeta(redis, prevMetaKey);
  if (!prevMeta) {
    return { ok: false, status: 404, error: "Run not found" };
  }
  if (prevMeta.username !== username) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  const agentId =
    typeof prevMeta.agentId === "string" ? prevMeta.agentId : "";
  if (!agentId) {
    return { ok: false, status: 409, error: "Run is missing agent id" };
  }
  const activeRunId =
    typeof prevMeta.activeRunId === "string" ? prevMeta.activeRunId : "";
  if (activeRunId && activeRunId !== previousRunId) {
    log(
      "[cursorRyOsRepoAgent] follow-up requested but agent already busy",
      { agentId, activeRunId }
    );
    return {
      ok: false,
      status: 409,
      error: "Agent is busy with another run",
    };
  }
  const terminalStatus =
    typeof prevMeta.terminalStatus === "string"
      ? prevMeta.terminalStatus
      : "";
  if (!terminalStatus) {
    return {
      ok: false,
      status: 409,
      error: "Previous run is still in progress",
    };
  }

  const agentTitle =
    typeof prevMeta.agentTitle === "string" ? prevMeta.agentTitle : undefined;
  const repoUrl =
    typeof prevMeta.repoUrl === "string" ? prevMeta.repoUrl : undefined;
  const startingRef =
    typeof prevMeta.startingRef === "string"
      ? prevMeta.startingRef
      : undefined;
  const modelId =
    typeof prevMeta.modelId === "string" ? prevMeta.modelId : undefined;
  const autoCreatePR =
    typeof prevMeta.autoCreatePR === "boolean"
      ? prevMeta.autoCreatePR
      : undefined;
  const inheritedPrUrl =
    typeof prevMeta.prUrl === "string" ? prevMeta.prUrl : undefined;

  let agent: import("@cursor/sdk").SDKAgent;
  try {
    const { Agent } = await import("@cursor/sdk");
    const resumeOptions: Partial<import("@cursor/sdk").AgentOptions> = {
      apiKey,
      ...(modelId ? { model: { id: modelId } } : {}),
    };
    agent = await Agent.resume(agentId, resumeOptions);
  } catch (e) {
    logError("[cursorRyOsRepoAgent] Agent.resume failed", e);
    return {
      ok: false,
      status: 502,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  let run: import("@cursor/sdk").Run;
  try {
    run = await agent.send(prompt);
  } catch (e) {
    logError("[cursorRyOsRepoAgent] follow-up send failed", e);
    try {
      const dispose = agent[Symbol.asyncDispose];
      if (typeof dispose === "function") await dispose.call(agent);
    } catch (disposeErr) {
      logError(
        "[cursorRyOsRepoAgent] agent dispose failed (after send error)",
        disposeErr
      );
    }
    return {
      ok: false,
      status: 502,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const newRunId = run.id;
  const newEventsKey = cursorSdkEventsKey(newRunId);
  const newMetaKey = cursorSdkMetaKey(newRunId);

  await redis.set(
    newMetaKey,
    JSON.stringify({
      username,
      runId: newRunId,
      agentId,
      ...(agentTitle ? { agentTitle } : {}),
      ...(repoUrl ? { repoUrl } : {}),
      ...(startingRef ? { startingRef } : {}),
      ...(modelId ? { modelId } : {}),
      ...(typeof autoCreatePR === "boolean" ? { autoCreatePR } : {}),
      ...(inheritedPrUrl ? { prUrl: inheritedPrUrl } : {}),
      createdAt: Date.now(),
      promptPreview: prompt.slice(0, 280),
      activeRunId: newRunId,
      previousRunId,
      isFollowup: true,
    }),
    { ex: CURSOR_SDK_RUN_TTL_SEC }
  );

  await writeMergedMeta(
    redis,
    prevMetaKey,
    { nextRunId: newRunId },
    log
  );

  await redis.set(
    cursorSdkAgentLatestRunKey(agentId),
    JSON.stringify({
      username,
      runId: newRunId,
      ...(agentTitle ? { agentTitle } : {}),
    }),
    { ex: CURSOR_SDK_RUN_TTL_SEC }
  );

  spawnBackgroundCursorRun({
    redis,
    runId: newRunId,
    agentId,
    ...(agentTitle ? { agentTitle } : {}),
    username,
    eventsKey: newEventsKey,
    metaKey: newMetaKey,
    ...(repoUrl ? { repoUrl } : {}),
    ...(startingRef ? { startingRef } : {}),
    ...(modelId ? { modelId } : {}),
    ...(typeof autoCreatePR === "boolean" ? { autoCreatePR } : {}),
    ...(inheritedPrUrl ? { inheritedPrUrl } : {}),
    disposeAgentAfter: true,
    log,
    logError,
    agent,
    run,
    ...(context.notifyTelegram
      ? { notifyTelegram: context.notifyTelegram }
      : {}),
  });

  return {
    ok: true,
    runId: newRunId,
    agentId,
    previousRunId,
    message: "Cursor Cloud agent follow-up started.",
  };
}
