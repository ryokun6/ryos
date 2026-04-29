/**
 * Cursor Cloud Agents API v1 client (https://api.cursor.com).
 *
 * Auth: Basic with API key as username and empty password (`-u KEY:` per Cursor docs).
 *
 * Environment (server-side only; never expose to the client):
 * - CURSOR_API_KEY — from Cursor Dashboard → Integrations (required to use the tool)
 * - CURSOR_RYOS_REPO_URLS — comma-separated GitHub HTTPS URLs allowed for this deployment
 *   (e.g. https://github.com/ryokun6/ryos). If unset, defaults to the public ryOS repo.
 */

const DEFAULT_CURSOR_API_BASE = "https://api.cursor.com";

const DEFAULT_RYOS_REPO = "https://github.com/ryokun6/ryos";

/** Run statuses we treat as terminal when polling stream fallbacks. */
const TERMINAL_RUN_STATUSES = new Set([
  "FINISHED",
  "FAILED",
  "ERROR",
  "CANCELLED",
  "CANCELED",
]);

export type CursorAgentCreateResponse = {
  agent?: {
    id?: string;
    url?: string;
    name?: string;
    latestRunId?: string;
  };
  run?: {
    id?: string;
    status?: string;
    agentId?: string;
  };
};

export type CursorRunResponse = {
  id?: string;
  agentId?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};

export function getCursorCloudApiBaseUrl(env: NodeJS.ProcessEnv): string {
  const raw = env.CURSOR_CLOUD_API_BASE_URL?.trim().replace(/\/$/, "");
  return raw || DEFAULT_CURSOR_API_BASE;
}

export function getCursorApiKey(env: NodeJS.ProcessEnv): string | null {
  const key = env.CURSOR_API_KEY?.trim();
  return key ? key : null;
}

/**
 * GitHub HTTPS repo URLs permitted for Cursor Cloud Agent launches from ryOS Telegram.
 */
export function getAllowedRyosRepoUrls(env: NodeJS.ProcessEnv): string[] {
  const explicit = env.CURSOR_RYOS_REPO_URLS?.trim();
  const raw =
    explicit && explicit.length > 0 ? explicit : DEFAULT_RYOS_REPO;
  return raw
    .split(",")
    .map((s) =>
      normalizeGithubRepoHttpsUrl(String(s || "").trim())
    )
    .filter((u): u is string => u !== null && u.length > 0);
}

export function normalizeGithubRepoHttpsUrl(
  candidate: string
): string | null {
  try {
    const u = candidate.startsWith("http")
      ? new URL(candidate)
      : new URL(`https://${candidate}`);
    if (u.hostname !== "github.com") {
      return null;
    }
    const pathname = u.pathname.replace(/\/+$/, "").replace(/^\/+/, "/");
    if (!pathname.match(/^\/[^/]+\/[^/]+$/)) {
      return null;
    }
    return `https://github.com${pathname}`;
  } catch {
    return null;
  }
}

/** Returns true iff `requested` resolves to one of the HTTPS allowlist URLs. */
export function isRepoAllowed(
  repoUrl: string,
  allowed: string[]
): boolean {
  const n = normalizeGithubRepoHttpsUrl(repoUrl);
  if (!n || allowed.length === 0) return false;
  const allowSet = new Set(allowed.map((a) => normalizeGithubRepoHttpsUrl(a)!));
  return allowSet.has(n);
}

export function authorizationHeader(apiKey: string): string {
  const token = Buffer.from(`${apiKey}:`, "utf8").toString("base64");
  return `Basic ${token}`;
}

export async function cursorApiJson<T>(
  env: NodeJS.ProcessEnv,
  apiKey: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const base = getCursorCloudApiBaseUrl(env);
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: authorizationHeader(apiKey),
      ...(init?.headers as Record<string, string>),
    },
  });

  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }

  if (!res.ok) {
    const detail =
      body && typeof body === "object" && body !== null && "message" in body
        ? String((body as { message?: unknown }).message)
        : text || res.statusText;
    throw new Error(`Cursor API ${res.status}: ${detail}`);
  }

  return body as T;
}

export type CursorAgentRecord = {
  id?: string;
  url?: string;
  branchName?: string;
  repos?: unknown;
};

export async function getCursorAgent(
  env: NodeJS.ProcessEnv,
  apiKey: string,
  agentId: string
): Promise<CursorAgentRecord> {
  return cursorApiJson<CursorAgentRecord>(
    env,
    apiKey,
    `/v1/agents/${encodeURIComponent(agentId)}`,
    { method: "GET" }
  );
}

export async function createCursorAgentRun(
  env: NodeJS.ProcessEnv,
  apiKey: string,
  args: {
    promptText: string;
    repoUrl: string;
    startingRef?: string;
    autoCreatePR?: boolean;
    modelId?: string;
    branchName?: string;
    autoGenerateBranch?: boolean;
  }
): Promise<CursorAgentCreateResponse> {
  const repos: Record<string, unknown>[] = [{ url: args.repoUrl }];
  if (args.startingRef?.trim()) {
    repos[0].startingRef = args.startingRef.trim();
  }

  const payload: Record<string, unknown> = {
    prompt: { text: args.promptText },
    repos,
  };

  if (typeof args.autoCreatePR === "boolean") {
    payload.autoCreatePR = args.autoCreatePR;
  }
  if (typeof args.branchName === "string" && args.branchName.trim()) {
    payload.branchName = args.branchName.trim();
  }
  if (typeof args.autoGenerateBranch === "boolean") {
    payload.autoGenerateBranch = args.autoGenerateBranch;
  }
  if (args.modelId?.trim()) {
    payload.model = { id: args.modelId.trim() };
  }

  return cursorApiJson<CursorAgentCreateResponse>(
    env,
    apiKey,
    "/v1/agents",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function getCursorRun(
  env: NodeJS.ProcessEnv,
  apiKey: string,
  agentId: string,
  runId: string
): Promise<CursorRunResponse> {
  return cursorApiJson<CursorRunResponse>(
    env,
    apiKey,
    `/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}`,
    { method: "GET" }
  );
}

export type ParsedSseEvent = { event: string | null; data: string };

/** Minimal SSE-over-HTTPS reader (newline-delimited frames, multi-line data). */
async function parseSseStream(
  body: ReadableStream<Uint8Array>,
  emit: (ev: ParsedSseEvent) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let pendingEvent: string | null = null;
  let dataLines: string[] = [];

  const flushFrame = (): void => {
    if (dataLines.length === 0) return;
    const data = dataLines.join("\n");
    dataLines = [];
    const evName = pendingEvent;
    pendingEvent = null;
    emit({ event: evName, data });
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      while (buffer.includes("\n")) {
        const nl = buffer.indexOf("\n");
        const rawLine = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);

        let line =
          rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
        line = line.replace(/\u0000/g, "");

        if (!line.trim()) {
          flushFrame();
          pendingEvent = null;
          continue;
        }

        if (line.startsWith("event:")) {
          flushFrame();
          pendingEvent = line.slice("event:".length).trim();
          continue;
        }
        if (line.startsWith("data:")) {
          dataLines.push(line.slice("data:".length).trimStart());
          continue;
        }
      }
    }
    flushFrame();
  } finally {
    reader.releaseLock();
  }
}

export type CursorAgentStreamHooks = {
  onStatus?: (status: unknown) => void;
  onAssistantDelta?: (text: string) => void;
  onThinkingDelta?: (text: string) => void;
  onResult?: (status: unknown) => void;
  onError?: (code: unknown, message: string) => void;
  onDone?: () => void;
};

/** Stream SSE for one run until `done`, `result`, terminal `status`, or `error`. */
export async function streamCursorAgentRun(
  env: NodeJS.ProcessEnv,
  apiKey: string,
  agentId: string,
  runId: string,
  hooks: CursorAgentStreamHooks
): Promise<void> {
  const base = getCursorCloudApiBaseUrl(env);
  const url = `${base}/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}/stream`;
  const res = await fetch(url, {
    headers: {
      Authorization: authorizationHeader(apiKey),
      Accept: "text/event-stream",
    },
  });

  if (res.status === 410) {
    hooks.onError?.("stream_expired", "SSE stream expired; using status polling.");
    await pollUntilTerminal(env, apiKey, agentId, runId, hooks);
    return;
  }

  if (!res.ok || !res.body) {
    hooks.onError?.(
      "http_error",
      `Stream failed (${res.status})`
    );
    await pollUntilTerminal(env, apiKey, agentId, runId, hooks);
    return;
  }

  await parseSseStream(res.body, ({ event, data }) => {
    let parsed: unknown = null;
    try {
      parsed = data ? JSON.parse(data) : null;
    } catch {
      parsed = null;
    }

    const evt = (event || "").trim();

    switch (evt) {
      case "assistant": {
        const text =
          parsed &&
          typeof parsed === "object" &&
          parsed !== null &&
          "text" in parsed &&
          typeof (parsed as { text: unknown }).text === "string"
            ? (parsed as { text: string }).text
            : "";
        if (text) hooks.onAssistantDelta?.(text);
        break;
      }
      case "thinking": {
        const text =
          parsed &&
          typeof parsed === "object" &&
          parsed !== null &&
          "text" in parsed &&
          typeof (parsed as { text: unknown }).text === "string"
            ? (parsed as { text: string }).text
            : "";
        if (text) hooks.onThinkingDelta?.(text);
        break;
      }
      case "status":
      case "":
      case "heartbeat":
        hooks.onStatus?.(parsed ?? data);
        break;
      case "result":
        hooks.onResult?.(parsed);
        hooks.onDone?.();
        break;
      case "error": {
        const code =
          parsed &&
          typeof parsed === "object" &&
          parsed !== null &&
          "code" in parsed
            ? (parsed as { code: unknown }).code
            : null;
        const msg =
          parsed &&
          typeof parsed === "object" &&
          parsed !== null &&
          "message" in parsed
            ? String((parsed as { message: unknown }).message)
            : data || "unknown";
        hooks.onError?.(code, msg);
        break;
      }
      case "done":
        hooks.onDone?.();
        break;
      default:
        break;
    }
  });
}

export async function pollUntilTerminal(
  env: NodeJS.ProcessEnv,
  apiKey: string,
  agentId: string,
  runId: string,
  hooks: Pick<CursorAgentStreamHooks, "onStatus" | "onResult">
): Promise<CursorRunResponse | null> {
  const maxIterations = 120;
  let last: CursorRunResponse | null = null;
  for (let i = 0; i < maxIterations; i++) {
    await new Promise((r) => setTimeout(r, Math.min(2000 + i * 100, 10_000)));
    try {
      last = await getCursorRun(env, apiKey, agentId, runId);
    } catch {
      continue;
    }
    const st = (last.status || "").toUpperCase();
    hooks.onStatus?.({ runId: last.id, agentId: last.agentId, status: last.status });
    if (st && TERMINAL_RUN_STATUSES.has(st)) {
      hooks.onResult?.({
        runId,
        status: last.status,
        polled: true,
      });
      return last;
    }
  }
  return last;
}

export function summarizeTerminalRunStatus(run: CursorRunResponse | null): string {
  const s = run?.status || "UNKNOWN";
  return s.toUpperCase();
}
