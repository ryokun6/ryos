/**
 * Cursor SDK (@cursor/sdk) — Cursor Cloud Agents against ryokun6/ryos.
 * Async mode (Redis): starts run and returns immediately; events stream to Redis for polling.
 * Fallback (no Redis): blocking Agent.prompt (legacy).
 */

import type { Redis } from "../../_utils/redis.js";
import { getAppPublicOrigin } from "../../_utils/runtime-config.js";
import { sendTelegramMessage } from "../../_utils/telegram.js";
import { z } from "zod";
import type { MemoryToolContext } from "./executors.js";

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
  "Run Cursor's coding agent in Cursor Cloud against the GitHub repo ryokun6/ryos (not the browser VFS). Use when the user asks to implement, debug, or refactor the real ryOS product codebase—not virtual paths like /Documents or /Applets (those use read/write/edit). Give clear instructions and desired outcomes. Uses CURSOR_API_KEY and Cursor SDK billing. The run is asynchronous: you get an immediate acknowledgment while work continues; on web, the user can open the run panel in Chats for live stream events; on Telegram, status updates are delivered in this chat.";

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

export interface CursorRyOsRepoAgentContext extends MemoryToolContext {
  apiKey: string;
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

/** Upstash may return objects for JSON-looking strings */
function parseStoredJsonLine(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  return null;
}

export function extractPrUrlFromTerminalPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const rec = payload as Record<string, unknown>;
  const git = rec.git;
  if (!git || typeof git !== "object") return null;
  const branches = (git as { branches?: unknown }).branches;
  if (!Array.isArray(branches)) return null;
  for (const b of branches) {
    if (!b || typeof b !== "object") continue;
    const url = (b as { prUrl?: unknown }).prUrl;
    if (typeof url === "string" && url.startsWith("http")) return url.trim();
  }
  return null;
}

export function findTerminalEventInRedisLines(lines: unknown[]): {
  status?: string;
  summary?: string;
  error?: string;
  prUrl?: string | null;
} | null {
  for (const raw of lines) {
    const parsed = parseStoredJsonLine(raw);
    if (!parsed || typeof parsed !== "object") continue;
    const o = parsed as Record<string, unknown>;
    if (o.type === "terminal") {
      return {
        status: typeof o.status === "string" ? o.status : undefined,
        summary: typeof o.summary === "string" ? o.summary : undefined,
        error: typeof o.error === "string" ? o.error : undefined,
        prUrl: extractPrUrlFromTerminalPayload(o),
      };
    }
  }
  return null;
}

const TELEGRAM_CURSOR_POLL_MS = 12_000;
const TELEGRAM_CURSOR_STALE_MS = 25 * 60 * 1000;

function spawnTelegramCursorRunFollowUp(input: {
  redis: Redis;
  eventsKey: string;
  runId: string;
  appOrigin: string;
  notify: {
    botToken: string;
    chatId: string;
    replyToMessageId: number;
  };
  log: (...args: unknown[]) => void;
  logError: (...args: unknown[]) => void;
}): void {
  void (async () => {
    const {
      redis,
      eventsKey,
      runId,
      appOrigin,
      notify,
      log,
      logError,
    } = input;

    const startedAt = Date.now();
    let lastNudgeAt = startedAt;

    try {
      while (true) {
        const rawLinesUnknown = await redis.lrange(eventsKey, 0, 199);
        const lines = Array.isArray(rawLinesUnknown) ? rawLinesUnknown : [];

        const terminal = findTerminalEventInRedisLines(lines);
        if (terminal) {
          const status = terminal.status ?? "unknown";

          let body =
            status === "finished"
              ? "Cursor Cloud agent finished."
              : status === "error"
                ? "Cursor Cloud agent run reported an error."
                : `Cursor Cloud agent ended (${status}).`;

          if (terminal.prUrl) {
            body += `\n\nPR: ${terminal.prUrl}`;
          } else if (terminal.summary?.trim()) {
            const snippet =
              terminal.summary.length > 1200
                ? `${terminal.summary.slice(0, 1197)}…`
                : terminal.summary.trim();
            body += `\n\n${snippet}`;
          } else if (terminal.error?.trim()) {
            body += `\n\n${terminal.error.trim()}`;
          }

          body += `\n\nFull stream + status in ryOS Chats (repo agent panel), or poll ${appOrigin}/api/ai/cursor-run-status?runId=${encodeURIComponent(
            runId
          )} while signed in.`;

          await sendTelegramMessage({
            botToken: notify.botToken,
            chatId: notify.chatId,
            text: body,
            replyToMessageId: notify.replyToMessageId,
          });
          return;
        }

        const now = Date.now();
        const sinceStart = now - startedAt;
        const sinceNudge = now - lastNudgeAt;

        if (
          sinceStart >= 90_000 &&
          sinceNudge >= TELEGRAM_CURSOR_STALE_MS
        ) {
          const eventCount = lines.length;
          await sendTelegramMessage({
            botToken: notify.botToken,
            chatId: notify.chatId,
            text:
              eventCount > 0
                ? `Still running — ${eventCount} stream events so far. Open ryOS Chats for the live Cursor repo agent panel; I'll message again when it completes.`
                : "Still waiting on the Cursor Cloud agent. Open ryOS Chats for live progress; I'll message again when it completes.",
            replyToMessageId: notify.replyToMessageId,
          });
          lastNudgeAt = now;
        }

        await new Promise((r) => setTimeout(r, TELEGRAM_CURSOR_POLL_MS));
      }
    } catch (e) {
      logError("[cursorRyOsRepoAgent] Telegram follow-up failed", e);
      try {
        await sendTelegramMessage({
          botToken: notify.botToken,
          chatId: notify.chatId,
          text:
            "Cursor Cloud agent is running — I couldn't stream progress updates here. Open ryOS Chats to watch the run, or check back later.",
          replyToMessageId: notify.replyToMessageId,
        });
      } catch (sendErr) {
        logError("[cursorRyOsRepoAgent] Telegram follow-up fallback send failed", sendErr);
      }
    }
  })();

  log("[cursorRyOsRepoAgent] Telegram follow-up watcher spawned", { runId });
}

async function notifyTelegramBlockingRunComplete(
  result: CursorRyOsRepoAgentToolOutput,
  notify: NonNullable<CursorRyOsRepoAgentContext["telegramCursorRunNotify"]>,
  appOrigin: string
): Promise<void> {
  if ("async" in result && result.async) return;

  const ok = result.success === true;
  let text = ok
    ? "Cursor Cloud agent finished (blocking run)."
    : "Cursor Cloud agent run failed.";

  if (result.summary?.trim()) {
    const s =
      result.summary.length > 1200
        ? `${result.summary.slice(0, 1197)}…`
        : result.summary.trim();
    text += `\n\n${s}`;
  }
  if (!ok && result.error) {
    text += `\n\n${result.error}`;
  }
  text += `\n\nDetails in ryOS Chats if you started from there: ${appOrigin}`;

  await sendTelegramMessage({
    botToken: notify.botToken,
    chatId: notify.chatId,
    text,
    replyToMessageId: notify.replyToMessageId,
  });
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
    } catch (e) {
      logError("[cursorRyOsRepoAgent] background run failed", e);
      await safePushEvent(redis, eventsKey, {
        ts: Date.now(),
        type: "terminal",
        status: "error",
        error: e instanceof Error ? e.message : String(e),
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
          error: e instanceof Error ? e.message : String(e),
        }),
        { ex: CURSOR_SDK_RUN_TTL_SEC }
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
      const result = await executeBlockingPrompt(input, context, {
        repoUrl,
        startingRef,
        autoCreatePR,
        modelId,
      });
      if (context.telegramCursorRunNotify) {
        void notifyTelegramBlockingRunComplete(
          result,
          context.telegramCursorRunNotify,
          getAppPublicOrigin()
        ).catch((err) =>
          context.logError("[cursorRyOsRepoAgent] Telegram blocking notify failed", err)
        );
      }
      return result;
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
    });

    if (context.telegramCursorRunNotify) {
      spawnTelegramCursorRunFollowUp({
        redis: context.redis,
        eventsKey,
        runId,
        appOrigin: getAppPublicOrigin(),
        notify: context.telegramCursorRunNotify,
        log: context.log,
        logError: context.logError,
      });
    }

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
