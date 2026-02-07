import { createPrivateKey, createSign } from "node:crypto";

export interface ApnsConfig {
  keyId: string;
  teamId: string;
  bundleId: string;
  privateKey: string;
  useSandbox: boolean;
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

let cachedJwt: { token: string; expiresAt: number } | null = null;

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

export function getApnsConfigFromEnv(): ApnsConfig | null {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const bundleId = process.env.APNS_BUNDLE_ID;
  const privateKeyRaw = process.env.APNS_PRIVATE_KEY;
  const useSandbox =
    process.env.APNS_USE_SANDBOX === "1" ||
    process.env.APNS_USE_SANDBOX === "true";

  if (!keyId || !teamId || !bundleId || !privateKeyRaw) {
    return null;
  }

  return {
    keyId,
    teamId,
    bundleId,
    privateKey: normalizePrivateKey(privateKeyRaw),
    useSandbox,
  };
}

function createApnsJwt(config: ApnsConfig): string {
  const now = Date.now();
  if (cachedJwt && cachedJwt.expiresAt > now) {
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
  };
  return jwt;
}

export async function sendApnsAlert(
  config: ApnsConfig,
  deviceToken: string,
  payload: ApnsAlertPayload
): Promise<ApnsSendResult> {
  const host = config.useSandbox
    ? "https://api.sandbox.push.apple.com"
    : "https://api.push.apple.com";
  const url = `${host}/3/device/${encodeURIComponent(deviceToken)}`;

  const authorization = `bearer ${createApnsJwt(config)}`;
  const apnsPayload: Record<string, unknown> = {
    aps: {
      alert: {
        title: payload.title,
        body: payload.body,
      },
      badge: payload.badge,
      sound: payload.sound ?? "default",
    },
    ...(payload.data ? { data: payload.data } : {}),
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization,
      "apns-topic": config.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify(apnsPayload),
  });

  const apnsId = response.headers.get("apns-id");
  if (response.ok) {
    return {
      ok: true,
      status: response.status,
      token: deviceToken,
      apnsId,
    };
  }

  let reason = `HTTP_${response.status}`;
  try {
    const errorData = await response.json();
    if (typeof errorData?.reason === "string") {
      reason = errorData.reason;
    }
  } catch {
    // ignore JSON parse failures for non-JSON APNs responses
  }

  return {
    ok: false,
    status: response.status,
    token: deviceToken,
    apnsId,
    reason,
  };
}
