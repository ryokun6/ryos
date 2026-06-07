import { SignJWT, importPKCS8, type CryptoKey } from "jose";

export interface ApplePrivateKeyParseResult {
  pem: string | null;
  reason?: string;
  rawLength?: number;
  bodyLength?: number;
  hasBeginMarker?: boolean;
  hasEndMarker?: boolean;
  invalidCharSample?: string;
}

export interface AppleSignedJwt {
  token: string;
  expiresAt: number;
}

export function parseApplePrivateKey(
  raw: string | undefined
): ApplePrivateKeyParseResult {
  if (!raw || raw.trim().length === 0) {
    return { pem: null, reason: "env var empty or unset" };
  }

  const body = raw
    .replace(/\\\\n/g, "\n")
    .replace(/\\\\r\\\\n/g, "\n")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  const beginMatch = body.match(/-----BEGIN [A-Z0-9 ]+-----/);
  const endMatch = body.match(/-----END [A-Z0-9 ]+-----/);

  let header = "-----BEGIN PRIVATE KEY-----";
  let footer = "-----END PRIVATE KEY-----";
  let base64Body: string;

  if (beginMatch && endMatch) {
    header = beginMatch[0];
    footer = endMatch[0];
    base64Body = body
      .slice(beginMatch.index! + header.length, endMatch.index!)
      .replace(/\s+/g, "")
      .replace(/\\/g, "");
  } else {
    base64Body = body.replace(/\s+/g, "").replace(/\\/g, "");
  }

  if (base64Body.length === 0) {
    return {
      pem: null,
      reason: "no base64 body",
      rawLength: raw.length,
      bodyLength: body.length,
      hasBeginMarker: !!beginMatch,
      hasEndMarker: !!endMatch,
    };
  }

  const invalidChars = base64Body.match(/[^A-Za-z0-9+/=]/g);
  if (invalidChars && invalidChars.length > 0) {
    return {
      pem: null,
      reason: "base64 body contains non-base64 characters",
      rawLength: raw.length,
      bodyLength: base64Body.length,
      hasBeginMarker: !!beginMatch,
      hasEndMarker: !!endMatch,
      invalidCharSample: Array.from(new Set(invalidChars))
        .slice(0, 10)
        .map((c) => `0x${c.charCodeAt(0).toString(16)}`)
        .join(","),
    };
  }

  const wrapped = base64Body.match(/.{1,64}/g)?.join("\n") ?? base64Body;
  return { pem: `${header}\n${wrapped}\n${footer}\n` };
}

export async function importApplePrivateKey(pem: string): Promise<CryptoKey> {
  return importPKCS8(pem, "ES256");
}

export async function signAppleJwt({
  payload,
  privateKey,
  teamId,
  keyId,
  ttlSeconds,
}: {
  payload: Record<string, string>;
  privateKey: CryptoKey;
  teamId: string;
  keyId: string;
  ttlSeconds: number;
}): Promise<AppleSignedJwt> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSeconds;

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(privateKey);

  return { token, expiresAt: exp * 1000 };
}
