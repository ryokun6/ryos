/**
 * APNs push relay for the ryOS iOS app.
 *
 * Self-contained: device storage (Redis), the ES256 provider JWT, the HTTP/2
 * APNs sender, and the chat-message trigger all live here. Routes:
 * `api/push/register.ts`, `api/push/unregister.ts`. Trigger: the room message
 * broadcast in `api/rooms/_helpers/_pusher.ts` calls `notifyRoomMessage()`.
 *
 * Config: RYOS_APNS_TEAM_ID, RYOS_APNS_KEY_ID, and the `.p8` key via
 * RYOS_APNS_KEY_B64 (base64 of the file) or RYOS_APNS_KEY_FILE (path). When
 * unset, registration still works but no pushes are sent.
 *
 * Logging: `[push] …` lines via the shared API logger. Outcomes (delivery
 * failures, dead tokens, env changes, per-message summaries) log at
 * info/warn; every decision point logs at debug (RYOS_DEBUG / API_DEBUG_LOGS,
 * see `_logging.ts`). Never logs full device tokens, JWTs, keys, session
 * tokens/hashes, or message content.
 *
 * Storage (no credentials stored — `sessionHash` is the SHA-256 Redis id of the
 * registering session, used only to stop serving the device once that session
 * is signed out):
 *   integration:push:device:<token>             JSON PushDevice
 *   integration:push:device:<token>:watermarks  hash roomId -> RoomWatermark
 *   integration:push:user:<username>:devices    set of tokens
 *   integration:push:room:<roomId>:devices      set of tokens (room opt-ins)
 */

import http2 from "node:http2";
import { createPrivateKey, sign as cryptoSign, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRedis, type Redis } from "./redis.js";
import { parseJSON } from "./redis-helpers.js";
import { decodeHtmlEntitiesOnce } from "./html-entities.js";
import { createLogger, generateRequestId } from "./_logging.js";
import { redisKeys, sha256RedisIdentifier } from "../../src/shared/redisKeys.js";
import type { ApiChatMessage, ApiChatRoom } from "../../src/shared/contracts/chat.js";

// ============================================================================
// Constants & types
// ============================================================================

export const DEVICE_TOKEN_REGEX = /^[0-9a-f]{64}$/i;
export const APNS_TOPIC = "com.ryo.lu.ryos";
export const MAX_ROOMS_PER_DEVICE = 200;
export const PUSH_PREVIEW_MAX_CHARS = 240;

const DEFAULT_APNS_HOSTS = {
  sandbox: "https://api.sandbox.push.apple.com",
  prod: "https://api.push.apple.com",
} as const;

export type ApnsEnv = keyof typeof DEFAULT_APNS_HOSTS;

let apnsHosts: Record<ApnsEnv, string> = { ...DEFAULT_APNS_HOSTS };

/** Point the sender at a fake APNs server (tests). Pass null to restore. */
export function setApnsHostsForTesting(hosts: Record<ApnsEnv, string> | null): void {
  closeApnsSessions();
  apnsHosts = hosts ?? { ...DEFAULT_APNS_HOSTS };
}

/** Apple rejects provider tokens older than 60 minutes. */
const JWT_TTL_MS = 55 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const SESSION_IDLE_MS = 10 * 60 * 1000;
/** More than this many messages in a room within the window → one grouped push. */
const BURST_INDIVIDUAL_LIMIT = 3;
const BURST_WINDOW_MS = 60_000;

export interface PushDevice {
  deviceToken: string;
  username: string;
  rooms: string[];
  env: ApnsEnv;
  appVersion?: string;
  sessionHash: string;
  updatedAt: number;
}

interface RoomWatermark {
  id: string;
  ts: number;
  burstStart: number;
  burstCount: number;
}

export interface ApnsAlertPayload {
  chatRoomId: string;
  aps: {
    alert: { title: string; body: string };
    sound: "default";
    "thread-id": string;
  };
}

export interface ApnsResponse {
  status: number;
  reason?: string;
  apnsId?: string;
}

export interface ApnsDeliveryResult extends ApnsResponse {
  ok: boolean;
  env: ApnsEnv;
  envChanged: boolean;
  /** Token rejected by both hosts — safe to delete the device row. */
  tokenDead: boolean;
}

// ============================================================================
// Logging
// ============================================================================

export type PushLogger = ReturnType<typeof createLogger>;

/** For work not tied to a request (config load, `push:test`). */
const moduleLogger: PushLogger = createLogger("push");

/** `abcd…wxyz` — enough to correlate with the device without exposing it. */
export function redactDeviceToken(token: string): string {
  return token.length > 8 ? `${token.slice(0, 4)}…${token.slice(-4)}` : "****";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ============================================================================
// Config & provider JWT
// ============================================================================

interface ApnsConfig {
  teamId: string;
  keyId: string;
  key: KeyObject;
}

let cachedConfig: ApnsConfig | null | undefined;
let cachedJwt: { token: string; issuedAt: number } | null = null;

function loadPrivateKey(): KeyObject | null {
  const b64 = process.env.RYOS_APNS_KEY_B64?.trim();
  const file = process.env.RYOS_APNS_KEY_FILE?.trim();
  let raw: Buffer | null = null;
  if (b64) {
    raw = b64.includes("-----BEGIN") ? Buffer.from(b64) : Buffer.from(b64, "base64");
  } else if (file) {
    raw = readFileSync(file);
  }
  if (!raw) return null;

  const text = raw.toString("utf8");
  if (text.includes("-----BEGIN")) {
    return createPrivateKey({ key: text, format: "pem" });
  }
  return createPrivateKey({ key: raw, format: "der", type: "pkcs8" });
}

export function getApnsConfig(): ApnsConfig | null {
  if (cachedConfig !== undefined) return cachedConfig;
  const teamId = process.env.RYOS_APNS_TEAM_ID?.trim();
  const keyId = process.env.RYOS_APNS_KEY_ID?.trim();
  const keySource = process.env.RYOS_APNS_KEY_B64?.trim()
    ? "RYOS_APNS_KEY_B64"
    : process.env.RYOS_APNS_KEY_FILE?.trim()
      ? "RYOS_APNS_KEY_FILE"
      : null;
  if (!teamId || !keyId || !keySource) {
    const missing = [
      !teamId && "RYOS_APNS_TEAM_ID",
      !keyId && "RYOS_APNS_KEY_ID",
      !keySource && "RYOS_APNS_KEY_B64|RYOS_APNS_KEY_FILE",
    ].filter(Boolean);
    moduleLogger.info("[push] APNs not configured; pushes disabled", { missing });
    cachedConfig = null;
    return null;
  }
  try {
    const key = loadPrivateKey();
    cachedConfig = key ? { teamId, keyId, key } : null;
    moduleLogger.info("[push] APNs configured", {
      keySource,
      keyType: key?.asymmetricKeyType,
      curve: key?.asymmetricKeyDetails?.namedCurve,
    });
  } catch (error) {
    moduleLogger.error("[push] Failed to load APNs key", {
      keySource,
      error: errorMessage(error),
    });
    cachedConfig = null;
  }
  return cachedConfig;
}

export function isPushConfigured(): boolean {
  return getApnsConfig() !== null;
}

/** Drop cached config/JWT/HTTP2 sessions (env changes in tests & scripts). */
export function resetApnsState(): void {
  cachedConfig = undefined;
  cachedJwt = null;
  closeApnsSessions();
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * Convert an ASN.1 DER ECDSA signature (SEQUENCE { INTEGER r, INTEGER s }),
 * as produced by node:crypto, into the raw r||s form JWS requires.
 */
export function derToJoseSignature(der: Buffer, size = 32): Buffer {
  let offset = 0;

  const readLength = (): number => {
    let length = der[offset++];
    if (length & 0x80) {
      const byteCount = length & 0x7f;
      length = 0;
      for (let i = 0; i < byteCount; i++) length = (length << 8) | der[offset++];
    }
    return length;
  };

  const readInteger = (): Buffer => {
    if (der[offset++] !== 0x02) throw new Error("Invalid DER signature: expected INTEGER");
    const length = readLength();
    let value = der.subarray(offset, offset + length);
    offset += length;
    while (value.length > size && value[0] === 0) value = value.subarray(1);
    if (value.length > size) throw new Error("Invalid DER signature: integer too long");
    const out = Buffer.alloc(size);
    value.copy(out, size - value.length);
    return out;
  };

  if (der[offset++] !== 0x30) throw new Error("Invalid DER signature: expected SEQUENCE");
  readLength();
  return Buffer.concat([readInteger(), readInteger()]);
}

export function signApnsJwt(
  config: { teamId: string; keyId: string; key: KeyObject },
  nowMs = Date.now()
): string {
  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = base64url(
    JSON.stringify({ iss: config.teamId, iat: Math.floor(nowMs / 1000) })
  );
  const signingInput = `${header}.${claims}`;
  const der = cryptoSign("sha256", Buffer.from(signingInput), config.key);
  return `${signingInput}.${base64url(derToJoseSignature(der))}`;
}

function getProviderToken(config: ApnsConfig, forceRefresh = false): string {
  const now = Date.now();
  if (!forceRefresh && cachedJwt && now - cachedJwt.issuedAt < JWT_TTL_MS) {
    return cachedJwt.token;
  }
  cachedJwt = { token: signApnsJwt(config, now), issuedAt: now };
  return cachedJwt.token;
}

// ============================================================================
// HTTP/2 transport
// ============================================================================

const sessions = new Map<ApnsEnv, http2.ClientHttp2Session>();

function getSession(env: ApnsEnv): http2.ClientHttp2Session {
  const existing = sessions.get(env);
  if (existing && !existing.closed && !existing.destroyed) return existing;

  const session = http2.connect(apnsHosts[env]);
  const drop = () => {
    if (sessions.get(env) === session) sessions.delete(env);
  };
  session.on("error", (error) => {
    moduleLogger.warn("[push] APNs session error", { env, error: errorMessage(error) });
    drop();
  });
  session.on("goaway", drop);
  session.on("close", drop);
  session.setTimeout?.(SESSION_IDLE_MS, () => session.close());
  sessions.set(env, session);
  return session;
}

export function closeApnsSessions(): void {
  for (const session of sessions.values()) {
    try {
      session.close();
    } catch {
      // already closed
    }
  }
  sessions.clear();
}

function postToApns(
  env: ApnsEnv,
  deviceToken: string,
  body: string,
  headers: Record<string, string>
): Promise<ApnsResponse> {
  return new Promise((resolve) => {
    let settled = false;
    let status = 0;
    let apnsId: string | undefined;
    let responseBody = "";

    const finish = (result: ApnsResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    let request: http2.ClientHttp2Stream;
    try {
      request = getSession(env).request({
        ":method": "POST",
        ":path": `/3/device/${deviceToken}`,
        ...headers,
      });
    } catch (error) {
      resolve({ status: 0, reason: error instanceof Error ? error.message : String(error) });
      return;
    }

    const timer = setTimeout(() => {
      request.close();
      finish({ status: 0, reason: "Timeout" });
    }, REQUEST_TIMEOUT_MS);

    request.setEncoding("utf8");
    request.on("response", (responseHeaders) => {
      status = Number(responseHeaders[":status"]) || 0;
      const id = responseHeaders["apns-id"];
      apnsId = Array.isArray(id) ? id[0] : id;
    });
    request.on("data", (chunk: string) => {
      responseBody += chunk;
    });
    request.on("end", () => {
      let reason: string | undefined;
      if (responseBody) {
        try {
          reason = (JSON.parse(responseBody) as { reason?: string }).reason;
        } catch {
          reason = responseBody.slice(0, 200);
        }
      }
      finish({ status, reason, apnsId });
    });
    request.on("error", (error) => finish({ status: 0, reason: error.message }));
    request.end(body);
  });
}

function otherEnv(env: ApnsEnv): ApnsEnv {
  return env === "sandbox" ? "prod" : "sandbox";
}

/** Responses meaning "this token doesn't belong to this APNs host". */
function isEnvMismatch(response: ApnsResponse): boolean {
  if (response.status === 410) return true;
  if (response.status === 400 && response.reason === "BadDeviceToken") return true;
  return response.status === 403 && /Environment/i.test(response.reason ?? "");
}

function isDeadToken(response: ApnsResponse): boolean {
  return (
    response.status === 410 ||
    (response.status === 400 && response.reason === "BadDeviceToken")
  );
}

async function attemptDelivery(
  config: ApnsConfig,
  env: ApnsEnv,
  deviceToken: string,
  body: string,
  collapseId: string | undefined,
  logger: PushLogger
): Promise<ApnsResponse> {
  const send = async (jwt: string) => {
    const startedAt = Date.now();
    const response = await postToApns(env, deviceToken, body, {
      authorization: `bearer ${jwt}`,
      "apns-topic": APNS_TOPIC,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
      ...(collapseId ? { "apns-collapse-id": collapseId } : {}),
    });
    logger.debug("[push] APNs response", {
      device: redactDeviceToken(deviceToken),
      env,
      status: response.status,
      reason: response.reason,
      apnsId: response.apnsId,
      collapsed: !!collapseId,
      ms: Date.now() - startedAt,
    });
    return response;
  };

  const response = await send(getProviderToken(config));
  if (response.status === 403 && response.reason === "ExpiredProviderToken") {
    logger.debug("[push] Provider token expired; re-signing", { env });
    return send(getProviderToken(config, true));
  }
  if (response.status === 403 && response.reason === "InvalidProviderToken") {
    logger.error("[push] APNs rejected provider token — check RYOS_APNS_* config", { env });
  }
  return response;
}

/**
 * Send one alert. Tries `env` first; on a host mismatch (403 BadEnvironment,
 * 410 Unregistered, or 400 BadDeviceToken — what Apple returns for a sandbox
 * token on the prod host and vice versa) retries the other host once.
 * Returns null when APNs isn't configured.
 */
export async function sendApnsNotification(
  deviceToken: string,
  payload: ApnsAlertPayload,
  options: { env?: ApnsEnv; collapseId?: string; logger?: PushLogger } = {}
): Promise<ApnsDeliveryResult | null> {
  const logger = options.logger ?? moduleLogger;
  const config = getApnsConfig();
  if (!config) return null;

  const env = options.env ?? "sandbox";
  const body = JSON.stringify(payload);
  const first = await attemptDelivery(
    config,
    env,
    deviceToken,
    body,
    options.collapseId,
    logger
  );
  if (first.status === 200) {
    return { ...first, ok: true, env, envChanged: false, tokenDead: false };
  }
  if (!isEnvMismatch(first)) {
    return { ...first, ok: false, env, envChanged: false, tokenDead: false };
  }

  const fallbackEnv = otherEnv(env);
  logger.debug("[push] APNs env mismatch; retrying other host", {
    device: redactDeviceToken(deviceToken),
    from: env,
    to: fallbackEnv,
    status: first.status,
    reason: first.reason,
  });
  const second = await attemptDelivery(
    config,
    fallbackEnv,
    deviceToken,
    body,
    options.collapseId,
    logger
  );
  if (second.status === 200) {
    return { ...second, ok: true, env: fallbackEnv, envChanged: true, tokenDead: false };
  }
  return {
    ...second,
    ok: false,
    env,
    envChanged: false,
    tokenDead: isDeadToken(first) && isDeadToken(second),
  };
}

// ============================================================================
// Payload formatting
// ============================================================================

export function formatPushPreview(content: string): string {
  const text = decodeHtmlEntitiesOnce(content).replace(/\s+/g, " ").trim();
  const chars = Array.from(text);
  if (chars.length <= PUSH_PREVIEW_MAX_CHARS) return text;
  return `${chars.slice(0, PUSH_PREVIEW_MAX_CHARS - 1).join("").trimEnd()}…`;
}

/**
 * Room label for the alert title. Public/IRC rooms → `#name`. Private rooms →
 * the other participants besides sender and recipient (null for a 1:1 DM,
 * where the title is just `@sender`).
 */
export function getPushRoomLabel(
  room: Pick<ApiChatRoom, "name" | "type" | "members">,
  recipient: string,
  sender: string
): string | null {
  if (room.type === "private") {
    const others = (room.members ?? []).filter(
      (member) => member !== recipient.toLowerCase() && member !== sender.toLowerCase()
    );
    return others.length > 0 ? others.map((member) => `@${member}`).join(", ") : null;
  }
  return room.name.startsWith("#") ? room.name : `#${room.name}`;
}

export function buildPushPayload(
  roomId: string,
  title: string,
  body: string
): ApnsAlertPayload {
  return {
    chatRoomId: roomId,
    aps: {
      alert: { title, body },
      sound: "default",
      "thread-id": roomId,
    },
  };
}

// ============================================================================
// Device storage
// ============================================================================

export function normalizeDeviceToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim();
  return DEVICE_TOKEN_REGEX.test(token) ? token.toLowerCase() : null;
}

export async function getPushDevice(
  redis: Redis,
  deviceToken: string
): Promise<PushDevice | null> {
  return parseJSON<PushDevice>(
    await redis.get(redisKeys.integration.pushDevice(deviceToken))
  );
}

async function deleteDeviceRow(redis: Redis, device: PushDevice): Promise<void> {
  const token = device.deviceToken;
  await Promise.all([
    redis.del(
      redisKeys.integration.pushDevice(token),
      redisKeys.integration.pushDeviceWatermarks(token)
    ),
    redis.srem(redisKeys.integration.pushUserDevices(device.username), token),
    ...device.rooms.map((roomId) =>
      redis.srem(redisKeys.integration.pushRoomDevices(roomId), token)
    ),
  ]);
}

/**
 * Upsert on deviceToken. Idempotent. Omitting `rooms` keeps the current
 * subscriptions; a token re-registered by another account is moved over
 * (old subscriptions and watermarks dropped).
 */
export async function registerPushDevice(
  redis: Redis,
  input: {
    username: string;
    deviceToken: string;
    sessionToken: string;
    appVersion?: string;
    rooms?: string[];
  },
  logger: PushLogger = moduleLogger
): Promise<PushDevice> {
  const token = input.deviceToken.toLowerCase();
  const username = input.username.toLowerCase();
  const existing = await getPushDevice(redis, token);
  const sameOwner = existing?.username === username;

  if (existing && !sameOwner) {
    logger.info("[push] Device token moved to another account", {
      device: redactDeviceToken(token),
      username,
      droppedRooms: existing.rooms.length,
    });
    await deleteDeviceRow(redis, existing);
  }

  const rooms =
    input.rooms === undefined
      ? sameOwner
        ? existing!.rooms
        : []
      : Array.from(new Set(input.rooms)).slice(0, MAX_ROOMS_PER_DEVICE);

  let removedRooms = 0;
  if (existing && sameOwner) {
    const removed = existing.rooms.filter((roomId) => !rooms.includes(roomId));
    removedRooms = removed.length;
    if (removed.length > 0) {
      await Promise.all([
        ...removed.map((roomId) =>
          redis.srem(redisKeys.integration.pushRoomDevices(roomId), token)
        ),
        redis.hdel(redisKeys.integration.pushDeviceWatermarks(token), ...removed),
      ]);
    }
  }

  const device: PushDevice = {
    deviceToken: token,
    username,
    rooms,
    env: sameOwner ? existing!.env : "sandbox",
    appVersion: input.appVersion ?? (sameOwner ? existing!.appVersion : undefined),
    sessionHash: await sha256RedisIdentifier(input.sessionToken),
    updatedAt: Date.now(),
  };

  await Promise.all([
    redis.set(redisKeys.integration.pushDevice(token), JSON.stringify(device)),
    redis.sadd(redisKeys.integration.pushUserDevices(username), token),
    ...rooms.map((roomId) =>
      redis.sadd(redisKeys.integration.pushRoomDevices(roomId), token)
    ),
  ]);
  logger.debug("[push] Device row upserted", {
    device: redactDeviceToken(token),
    username,
    isNew: !existing,
    ownerChanged: !!existing && !sameOwner,
    env: device.env,
    appVersion: device.appVersion,
    roomCount: rooms.length,
    roomsKept: input.rooms === undefined,
    removedRooms,
  });
  return device;
}

/** Delete a device row the user owns. Returns false when absent / not owned. */
export async function unregisterPushDevice(
  redis: Redis,
  deviceToken: string,
  username: string,
  logger: PushLogger = moduleLogger
): Promise<boolean> {
  const device = await getPushDevice(redis, deviceToken.toLowerCase());
  if (!device || device.username !== username.toLowerCase()) {
    logger.debug("[push] Unregister skipped", {
      device: redactDeviceToken(deviceToken),
      username,
      reason: device ? "owned_by_other_account" : "not_registered",
    });
    return false;
  }
  await deleteDeviceRow(redis, device);
  return true;
}

/** Remove every device row for a user (logout-all / account deletion). */
export async function removeAllUserPushDevices(
  redis: Redis,
  username: string
): Promise<number> {
  const normalized = username.toLowerCase();
  const userSetKey = redisKeys.integration.pushUserDevices(normalized);
  const tokens = (await redis.smembers<string[]>(userSetKey)) ?? [];
  let removed = 0;
  for (const token of tokens) {
    const device = await getPushDevice(redis, token);
    if (device && device.username === normalized) {
      await deleteDeviceRow(redis, device);
      removed++;
    }
  }
  await redis.del(userSetKey);
  return removed;
}

// ============================================================================
// Trigger
// ============================================================================

async function collectCandidateTokens(
  redis: Redis,
  room: ApiChatRoom,
  sender: string
): Promise<string[]> {
  if (room.type === "private") {
    const recipients = (room.members ?? []).filter((member) => member !== sender);
    const sets = await Promise.all(
      recipients.map((member) =>
        redis.smembers<string[]>(redisKeys.integration.pushUserDevices(member))
      )
    );
    return Array.from(new Set(sets.flatMap((tokens) => tokens ?? [])));
  }
  return (await redis.smembers<string[]>(redisKeys.integration.pushRoomDevices(room.id))) ?? [];
}

function isEligible(device: PushDevice, room: ApiChatRoom, sender: string): boolean {
  if (device.username === sender) return false;
  if (room.type === "private") return (room.members ?? []).includes(device.username);
  return device.rooms.includes(room.id);
}

type DeliveryOutcome = "sent" | "failed" | "dead" | "duplicate" | "unconfigured";

async function deliverToDevice(
  redis: Redis,
  device: PushDevice,
  room: ApiChatRoom,
  message: ApiChatMessage,
  logger: PushLogger
): Promise<DeliveryOutcome> {
  const deviceLabel = redactDeviceToken(device.deviceToken);
  const watermarksKey = redisKeys.integration.pushDeviceWatermarks(device.deviceToken);
  const previous = parseJSON<RoomWatermark>(await redis.hget(watermarksKey, room.id));
  if (previous && (previous.id === message.id || message.timestamp < previous.ts)) {
    logger.debug("[push] Skipped by watermark", {
      device: deviceLabel,
      roomId: room.id,
      messageId: message.id,
      reason: previous.id === message.id ? "already_notified" : "older_than_watermark",
    });
    return "duplicate";
  }

  const now = Date.now();
  const inBurst = !!previous && now - previous.burstStart < BURST_WINDOW_MS;
  const watermark: RoomWatermark = {
    id: message.id,
    ts: message.timestamp,
    burstStart: inBurst ? previous!.burstStart : now,
    burstCount: inBurst ? previous!.burstCount + 1 : 1,
  };
  await redis.hset(watermarksKey, { [room.id]: JSON.stringify(watermark) });

  const label = getPushRoomLabel(room, device.username, message.username);
  const grouped = watermark.burstCount > BURST_INDIVIDUAL_LIMIT;
  if (grouped) {
    logger.debug("[push] Burst grouping", {
      device: deviceLabel,
      roomId: room.id,
      burstCount: watermark.burstCount,
      burstAgeMs: now - watermark.burstStart,
    });
  }
  const payload = grouped
    ? buildPushPayload(
        room.id,
        label ?? `@${message.username}`,
        `${watermark.burstCount} new messages`
      )
    : buildPushPayload(
        room.id,
        label ? `@${message.username} · ${label}` : `@${message.username}`,
        formatPushPreview(message.content)
      );

  const result = await sendApnsNotification(device.deviceToken, payload, {
    env: device.env,
    // Grouped alerts replace each other instead of stacking during a burst.
    collapseId: grouped ? `burst-${room.id}`.slice(0, 64) : undefined,
    logger,
  });
  if (!result) return "unconfigured";

  if (result.tokenDead) {
    logger.info("[push] Removing dead device token", {
      device: deviceLabel,
      username: device.username,
      status: result.status,
      reason: result.reason,
    });
    await deleteDeviceRow(redis, device);
    return "dead";
  }
  if (result.envChanged) {
    logger.info("[push] Device APNs env updated", {
      device: deviceLabel,
      username: device.username,
      from: device.env,
      to: result.env,
    });
    await redis.set(
      redisKeys.integration.pushDevice(device.deviceToken),
      JSON.stringify({ ...device, env: result.env })
    );
  }
  if (!result.ok) {
    logger.warn("[push] APNs delivery failed", {
      device: deviceLabel,
      username: device.username,
      roomId: room.id,
      env: result.env,
      status: result.status,
      reason: result.reason,
    });
    return "failed";
  }
  logger.debug("[push] Delivered", {
    device: deviceLabel,
    username: device.username,
    roomId: room.id,
    env: result.env,
    apnsId: result.apnsId,
    grouped,
  });
  return "sent";
}

/**
 * Push a newly persisted room message to the other participants' devices.
 * Private rooms notify every member's devices; public/IRC rooms notify only
 * devices that listed the room in `rooms` at registration. Devices whose
 * registering session has been signed out are dropped. Never throws.
 *
 * Logs one info summary per message that reached at least one device row;
 * every skip path logs at debug.
 */
export async function notifyRoomMessage(
  room: ApiChatRoom | null | undefined,
  message: ApiChatMessage,
  client?: Redis
): Promise<void> {
  const logger = createLogger(`push:${generateRequestId()}`);
  const startedAt = Date.now();
  const context = {
    roomId: room?.id,
    roomType: room?.type,
    messageId: message.id,
    sender: message.username,
  };
  try {
    if (!room) {
      logger.debug("[push] Skipped: room not found", context);
      return;
    }
    if (!isPushConfigured()) {
      logger.debug("[push] Skipped: APNs not configured", context);
      return;
    }
    logger.debug("[push] notifyRoomMessage start", context);
    const redis = client ?? createRedis();
    const sender = message.username.toLowerCase();

    const tokens = await collectCandidateTokens(redis, room, sender);
    if (tokens.length === 0) {
      logger.debug("[push] Skipped: no candidate devices", {
        ...context,
        memberCount: room.type === "private" ? (room.members ?? []).length : undefined,
      });
      return;
    }

    const rows = await redis.mget(
      ...tokens.map((token) => redisKeys.integration.pushDevice(token))
    );
    const parsed = rows.map((row) => parseJSON<PushDevice>(row));
    const devices = parsed.filter(
      (device): device is PushDevice => !!device && isEligible(device, room, sender)
    );
    const counts: Record<DeliveryOutcome | "sessionDead" | "error", number> = {
      sent: 0,
      failed: 0,
      dead: 0,
      duplicate: 0,
      unconfigured: 0,
      sessionDead: 0,
      error: 0,
    };

    await Promise.all(
      devices.map(async (device) => {
        try {
          const sessionAlive =
            (await redis.exists(redisKeys.auth.session(device.sessionHash))) > 0;
          if (!sessionAlive) {
            logger.info("[push] Dropping device: registering session signed out", {
              device: redactDeviceToken(device.deviceToken),
              username: device.username,
            });
            await deleteDeviceRow(redis, device);
            counts.sessionDead++;
            return;
          }
          counts[await deliverToDevice(redis, device, room, message, logger)]++;
        } catch (error) {
          counts.error++;
          logger.warn("[push] Device delivery threw", {
            device: redactDeviceToken(device.deviceToken),
            error: errorMessage(error),
          });
        }
      })
    );

    const missingRows = parsed.filter((device) => !device).length;
    const tally: Record<string, number> = {
      candidates: tokens.length,
      missingRows,
      ineligible: parsed.length - missingRows - devices.length,
      ...counts,
    };
    // Counts first and zeros omitted: the shared formatter truncates long lines.
    logger.info("[push] notifyRoomMessage done", {
      ...Object.fromEntries(Object.entries(tally).filter(([, value]) => value > 0)),
      ms: Date.now() - startedAt,
      ...context,
    });
  } catch (error) {
    logger.error("[push] notifyRoomMessage failed", { ...context, error: errorMessage(error) });
  }
}
