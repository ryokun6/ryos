import { createHash, createPrivateKey, createSign } from "node:crypto";
import {
  connect,
  constants,
  type ClientHttp2Session,
  type IncomingHttpHeaders,
} from "node:http2";
import { getMissingRequiredEnvVars } from "./_env.js";

export interface ApnsConfig {
  keyId: string;
  teamId: string;
  bundleId: string;
  privateKey: string;
  useSandbox: boolean;
  endpointOverride?: string;
  caCert?: string;
}

export interface ApnsAlertPayload {
  title: string;
  body: string;
  badge?: number;
  sound?: string;
  data?: Record<string, unknown>;
}

export interface ApnsSendResult {
  ok: boolean;
  status: number;
  token: string;
  apnsId?: string | null;
  reason?: string;
}

const JWT_VALIDITY_MS = 50 * 60 * 1000; // 50 minutes
const REQUIRED_APNS_ENV_VARS = [
  "APNS_KEY_ID",
  "APNS_TEAM_ID",
  "APNS_BUNDLE_ID",
  "APNS_PRIVATE_KEY",
] as const;

let cachedJwt: { token: string; expiresAt: number; cacheKey: string } | null = null;

function toBase64Url(input: Buffer | string): string {
  const buffer = typeof input === "string" ? Buffer.from(input) : input;
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function normalizePrivateKey(raw: string): string {
  return raw.replace(/\\n/g, "\n").trim();
}

function normalizePem(raw: string): string {
  return raw.replace(/\\n/g, "\n").trim();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === "string") {
    return error.message;
  }
  return String(error);
}

function normalizeEndpointOverride(raw: string | undefined): string | undefined {
  if (!raw) return undefined;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return undefined;
    if (!parsed.hostname) return undefined;
    return parsed.origin;
  } catch {
    return undefined;
  }
}

export function getMissingApnsEnvVars(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  return getMissingRequiredEnvVars(REQUIRED_APNS_ENV_VARS, env);
}

export function getApnsConfigFromEnv(): ApnsConfig | null {
  if (getMissingApnsEnvVars().length > 0) {
    return null;
  }

  const keyId = process.env.APNS_KEY_ID as string;
  const teamId = process.env.APNS_TEAM_ID as string;
  const bundleId = process.env.APNS_BUNDLE_ID as string;
  const privateKeyRaw = process.env.APNS_PRIVATE_KEY as string;
  const caCertRaw = process.env.APNS_CA_CERT;
  const endpointOverrideRaw = process.env.APNS_ENDPOINT_OVERRIDE?.trim();
  const useSandboxValue = process.env.APNS_USE_SANDBOX?.trim().toLowerCase();
  const useSandbox = useSandboxValue === "1" || useSandboxValue === "true";

  return {
    keyId,
    teamId,
    bundleId,
    privateKey: normalizePrivateKey(privateKeyRaw),
    useSandbox,
    endpointOverride: normalizeEndpointOverride(endpointOverrideRaw),
    caCert: caCertRaw ? normalizePem(caCertRaw) : undefined,
  };
}

function createApnsJwt(config: ApnsConfig): string {
  const now = Date.now();
  const cacheKey = createHash("sha256")
    .update(config.keyId)
    .update(":")
    .update(config.teamId)
    .update(":")
    .update(config.privateKey)
    .digest("hex");

  if (cachedJwt && cachedJwt.expiresAt > now && cachedJwt.cacheKey === cacheKey) {
    return cachedJwt.token;
  }

  const header = {
    alg: "ES256",
    kid: config.keyId,
  };

  const payload = {
    iss: config.teamId,
    iat: Math.floor(now / 1000),
  };

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const signer = createSign("sha256");
  signer.update(unsignedToken);
  signer.end();

  const privateKey = createPrivateKey(config.privateKey);
  const signature = signer.sign({
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });

  const jwt = `${unsignedToken}.${toBase64Url(signature)}`;
  cachedJwt = {
    token: jwt,
    expiresAt: now + JWT_VALIDITY_MS,
    cacheKey,
  };
  return jwt;
}

function getHeaderString(
  headers: IncomingHttpHeaders,
  key: string
): string | null {
  const value = headers[key];
  if (!value) return null;
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : null;
  }
  return typeof value === "string" ? value : null;
}

function closeSessionQuietly(session: ClientHttp2Session): void {
  if (session.closed || session.destroyed) return;
  try {
    session.close();
  } catch {
    // no-op
  }
}

export async function sendApnsAlert(
  config: ApnsConfig,
  deviceToken: string,
  payload: ApnsAlertPayload
): Promise<ApnsSendResult> {
  const authority =
    config.endpointOverride ||
    (config.useSandbox
      ? "https://api.sandbox.push.apple.com"
      : "https://api.push.apple.com");

  let authorization: string;
  try {
    authorization = `bearer ${createApnsJwt(config)}`;
  } catch (error) {
    return {
      ok: false,
      status: 0,
      token: deviceToken,
      reason: `JWT_ERROR:${getErrorMessage(error)}`,
    };
  }

  const apnsPayload: Record<string, unknown> = {
    aps: {
      alert: {
        title: payload.title,
        body: payload.body,
      },
      ...(typeof payload.badge === "number" ? { badge: payload.badge } : {}),
      sound: payload.sound ?? "default",
    },
    ...(payload.data ? { data: payload.data } : {}),
  };

  const body = JSON.stringify(apnsPayload);
  let session: ClientHttp2Session;
  try {
    session = connect(authority, config.caCert ? { ca: config.caCert } : undefined);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      token: deviceToken,
      reason: `CONNECT_ERROR:${getErrorMessage(error)}`,
    };
  }

  return new Promise<ApnsSendResult>((resolve) => {
    let settled = false;
    let status = 0;
    let apnsId: string | null = null;
    let responseBody = "";

    const finish = (result: ApnsSendResult) => {
      if (settled) return;
      settled = true;
      closeSessionQuietly(session);
      resolve(result);
    };

    session.once("error", (error) => {
      finish({
        ok: false,
        status: 0,
        token: deviceToken,
        reason: `SESSION_ERROR:${error.message}`,
      });
    });

    const request = session.request({
      [constants.HTTP2_HEADER_SCHEME]: "https",
      [constants.HTTP2_HEADER_METHOD]: "POST",
      [constants.HTTP2_HEADER_PATH]: `/3/device/${encodeURIComponent(deviceToken)}`,
      [constants.HTTP2_HEADER_AUTHORIZATION]: authorization,
      [constants.HTTP2_HEADER_CONTENT_TYPE]: "application/json",
      "apns-topic": config.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
    });

    request.setEncoding("utf8");
    request.setTimeout(15000, () => {
      request.close();
      finish({
        ok: false,
        status: 0,
        token: deviceToken,
        reason: "TIMEOUT",
      });
    });

    request.on("response", (headers) => {
      const statusHeader = headers[constants.HTTP2_HEADER_STATUS];
      status =
        typeof statusHeader === "number"
          ? statusHeader
          : Number(statusHeader || 0);
      apnsId = getHeaderString(headers, "apns-id");
    });

    request.on("data", (chunk: string) => {
      responseBody += chunk;
    });

    request.on("error", (error) => {
      finish({
        ok: false,
        status: status || 0,
        token: deviceToken,
        apnsId,
        reason: `REQUEST_ERROR:${error.message}`,
      });
    });

    request.on("end", () => {
      if (status >= 200 && status < 300) {
        finish({
          ok: true,
          status,
          token: deviceToken,
          apnsId,
        });
        return;
      }

      let reason = `HTTP_${status || 0}`;
      if (responseBody) {
        try {
          const errorData = JSON.parse(responseBody);
          if (typeof errorData?.reason === "string") {
            reason = errorData.reason;
          }
        } catch {
          // Ignore malformed JSON body and keep default reason.
        }
      }

      finish({
        ok: false,
        status: status || 0,
        token: deviceToken,
        apnsId,
        reason,
      });
    });

    request.end(body);
  });
}
