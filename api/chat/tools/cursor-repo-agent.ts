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

/** Default repo for ryOS Cursor Cloud runs (override with CURSOR_CLOUD_REPO_URL). */
export const DEFAULT_RYOS_GITHUB_REPO_URL = "https://github.com/ryokun6/ryos";

/** Shown to the model when this tool is enabled */
export const CURSOR_RYOS_REPO_AGENT_DESCRIPTION =
  "Run Cursor's coding agent in Cursor Cloud against the GitHub repo ryokun6/ryos (not the browser VFS). Use when the user asks to implement, debug, or refactor the real ryOS product codebase—not virtual paths like /Documents or /Applets (those use read/write/edit). Give clear instructions and desired outcomes. Uses CURSOR_API_KEY and Cursor SDK billing. The run is asynchronous: you get an immediate acknowledgment while work continues, and the user is notified when it completes (live stream in web chat, follow-up message on Telegram).";

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

function spawnBackgroundCursorRun(input: {
  redis: Redis;
  runId: string;
  agentId: string;
  agentTitle?: string;
  username: string;
  eventsKey: string;
  metaKey: string;
  repoUrl: string;
  startingRef: string;
  modelId: string;
  autoCreatePR: boolean;
  log: (...args: unknown[]) => void;
  logError: (...args: unknown[]) => void;
  agent: import("@cursor/sdk").SDKAgent;
  run: import("@cursor/sdk").Run;
  notifyTelegram?: CursorRepoAgentTelegramNotify;
}): void {
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

      await safePushEvent(redis, eventsKey, {
        ts: Date.now(),
        type: "terminal",
        status,
        summary,
        durationMs: run.durationMs,
        git: run.git,
      });

      await redis.set(
        metaKey,
        JSON.stringify({
          username,
          runId,
          agentId,
          ...(agentTitle ? { agentTitle } : {}),
          repoUrl,
          startingRef,
          modelId,
          autoCreatePR,
          finishedAt: Date.now(),
          terminalStatus: status,
          summary,
        }),
        { ex: CURSOR_SDK_RUN_TTL_SEC }
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
      await redis.set(
        metaKey,
        JSON.stringify({
          username,
          runId,
          agentId,
          ...(agentTitle ? { agentTitle } : {}),
          finishedAt: Date.now(),
          terminalStatus: "error",
          error: errorText,
        }),
        { ex: CURSOR_SDK_RUN_TTL_SEC }
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
      try {
        const dispose = agent[Symbol.asyncDispose];
        if (typeof dispose === "function") {
          await dispose.call(agent);
        }
      } catch (disposeErr) {
        logError("[cursorRyOsRepoAgent] agent dispose failed", disposeErr);
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
