import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPrivateOrReservedIp } from "./_ip.js";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.google.internal",
  "metadata.google.internal.",
  "169.254.169.254",
  "169.254.170.2",
]);

const BLOCKED_HOST_SUFFIXES = [
  ".local",
  ".internal",
  ".localhost",
  ".home.arpa",
];

export class SsrfBlockedError extends Error {
  readonly code = "SSRF_BLOCKED";
}

const isBlockedHostname = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(normalized)) return true;
  return BLOCKED_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
};

const stripIpLiteralBrackets = (hostname: string): string => {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }
  return hostname;
};

const resolveAndValidateHostname = async (hostname: string): Promise<void> => {
  const records = await lookup(hostname, { all: true, verbatim: true });
  if (!records.length) {
    throw new SsrfBlockedError("DNS lookup failed for URL");
  }
  const blockedRecord = records.find((record) =>
    isPrivateOrReservedIp(record.address)
  );
  if (blockedRecord) {
    throw new SsrfBlockedError("Private or reserved IPs are not allowed");
  }
};

export const validatePublicUrl = async (rawUrl: string): Promise<URL> => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError("Invalid URL format");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new SsrfBlockedError("Only HTTP and HTTPS URLs are allowed");
  }

  if (parsed.username || parsed.password) {
    throw new SsrfBlockedError("URL credentials are not allowed");
  }

  const hostname = parsed.hostname.toLowerCase();

  if (!hostname) {
    throw new SsrfBlockedError("URL hostname is missing");
  }

  if (isBlockedHostname(hostname)) {
    throw new SsrfBlockedError("Blocked hostname");
  }

  const ipLiteral = stripIpLiteralBrackets(hostname);
  if (isIP(ipLiteral)) {
    if (isPrivateOrReservedIp(ipLiteral)) {
      throw new SsrfBlockedError("Private or reserved IPs are not allowed");
    }
    return parsed;
  }

  await resolveAndValidateHostname(hostname);

  return parsed;
};

export const safeFetchWithRedirects = async (
  initialUrl: string,
  init: RequestInit,
  options: { maxRedirects?: number } = {}
): Promise<{
  response: Response;
  finalUrl: string;
  redirectChain: string[];
}> => {
  const maxRedirects = options.maxRedirects ?? 5;
  let currentUrl = initialUrl;
  let currentInit: RequestInit = { ...init, redirect: "manual" };
  const redirectChain: string[] = [];

  for (let attempt = 0; attempt <= maxRedirects; attempt += 1) {
    const validatedUrl = await validatePublicUrl(currentUrl);
    const response = await fetch(validatedUrl.toString(), {
      ...currentInit,
      redirect: "manual",
    });

    if (
      response.status >= 300 &&
      response.status < 400 &&
      response.headers.get("location")
    ) {
      const location = response.headers.get("location") as string;
      const nextUrl = new URL(location, validatedUrl).toString();
      redirectChain.push(nextUrl);

      try {
        response.body?.cancel();
      } catch {
        // Ignore body cancel errors
      }

      if (attempt === maxRedirects) {
        throw new SsrfBlockedError("Too many redirects");
      }

      if ([301, 302, 303].includes(response.status)) {
        currentInit = {
          ...currentInit,
          method: "GET",
          body: undefined,
        };
      }

      currentUrl = nextUrl;
      continue;
    }

    return {
      response,
      finalUrl: validatedUrl.toString(),
      redirectChain,
    };
  }

  throw new SsrfBlockedError("Too many redirects");
};
