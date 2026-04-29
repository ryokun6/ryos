/**
 * `cursorAgentStart` tool — kicks off a new Cursor Cloud agent run against the
 * ryokun6/ryos GitHub repo via @cursor/sdk.
 *
 * Async mode (Redis): starts the run and returns immediately; events stream
 * into Redis for the chat UI / `/api/ai/cursor-run-status` poller.
 * Fallback (no Redis): blocking `Agent.prompt`.
 *
 * To inspect or follow up on running/finished agents, use the companion
 * `cursorAgentList` tool.
 */

import type { Redis } from "../../_utils/redis.js";
import { z } from "zod";
import type { MemoryToolContext } from "./executors.js";
import { sendTelegramMessage } from "../../_utils/telegram.js";

/** Username allowed to invoke any cursorAgent* tool. */
export const CURSOR_AGENT_OWNER = "ryo";

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
export const CURSOR_AGENT_START_DESCRIPTION =
  "Start a new Cursor Cloud coding-agent run against the GitHub repo ryokun6/ryos (not the in-browser VFS). " +
  "Use when the user wants to implement, debug, or refactor the real ryOS product source on GitHub. " +
  "Do NOT use for virtual filesystem paths like /Documents or /Applets — those use the read/write/edit tools. " +
  "Give clear instructions and acceptance criteria. Runs on CURSOR_API_KEY billing. " +
  "The run is asynchronous: you get an immediate acknowledgment while work continues, and the user is notified " +
  "when it completes (live stream in web chat, follow-up message on Telegram). " +
  "To check on this run later or list other running/finished agents, use `cursorAgentList`.";

export const cursorAgentStartSchema = z.object({
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

export type CursorAgentStartInput = z.infer<typeof cursorAgentStartSchema>;

export interface CursorAgentTelegramNotify {
  botToken: string;
  chatId: string;
  /** Optional: message to reply-to (typically the user message that started the run). */
  replyToMessageId?: number;
}

export interface CursorAgentStartContext extends MemoryToolContext {
  apiKey: string;
  /** When set, send a Telegram message to this chat once the run terminates. */
  notifyTelegram?: CursorAgentTelegramNotify;
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
  notifyTelegram: CursorAgentTelegramNotify | undefined,
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
    logError("[cursorAgentStart] telegram notify failed", err);
  }
}

export type CursorAgentStartToolOutput =
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
  input: CursorAgentStartInput,
  context: CursorAgentStartContext,
  cloudOpts: {
    repoUrl: string;
    startingRef: string;
    autoCreatePR: boolean;
    modelId: string;
  }
): Promise<CursorAgentStartToolOutput> {
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
  notifyTelegram?: CursorAgentTelegramNotify;
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
        logError("[cursorAgentStart] run.wait failed", waitErr);
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
      logError("[cursorAgentStart] background run failed", e);
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
        logError("[cursorAgentStart] agent dispose failed", disposeErr);
      }
    }
  })();

  log("[cursorAgentStart] background consumer spawned", { runId, agentId });
}

export async function executeCursorAgentStart(
  input: CursorAgentStartInput,
  context: CursorAgentStartContext
): Promise<CursorAgentStartToolOutput> {
  if (context.username !== CURSOR_AGENT_OWNER) {
    context.log("[cursorAgentStart] denied: not owner account");
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
    `[cursorAgentStart] repo=${repoUrl} ref=${startingRef} model=${modelId} autoCreatePR=${autoCreatePR}`
  );

  if (!context.redis) {
    context.log("[cursorAgentStart] no Redis — falling back to blocking Agent.prompt");
    try {
      return await executeBlockingPrompt(input, context, {
        repoUrl,
        startingRef,
        autoCreatePR,
        modelId,
      });
    } catch (e) {
      context.logError("[cursorAgentStart] Agent.prompt failed", e);
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
      context.log("[cursorAgentStart] Agent.get (title) skipped", e);
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
    context.logError("[cursorAgentStart] Agent.create/send failed", e);
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
