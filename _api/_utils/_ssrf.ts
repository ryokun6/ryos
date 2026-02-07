import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

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

const IPV4_BLOCKED_RANGES: Array<[string, string]> = [
  ["0.0.0.0", "0.255.255.255"], // "this" network
  ["10.0.0.0", "10.255.255.255"], // private
  ["100.64.0.0", "100.127.255.255"], // carrier-grade NAT
  ["127.0.0.0", "127.255.255.255"], // loopback
  ["169.254.0.0", "169.254.255.255"], // link-local
  ["172.16.0.0", "172.31.255.255"], // private
  ["192.0.0.0", "192.0.0.255"], // IETF protocol assignments
  ["192.0.2.0", "192.0.2.255"], // TEST-NET-1
  ["192.88.99.0", "192.88.99.255"], // 6to4 relay
  ["192.168.0.0", "192.168.255.255"], // private
  ["198.18.0.0", "198.19.255.255"], // benchmark
  ["198.51.100.0", "198.51.100.255"], // TEST-NET-2
  ["203.0.113.0", "203.0.113.255"], // TEST-NET-3
  ["224.0.0.0", "239.255.255.255"], // multicast
  ["240.0.0.0", "255.255.255.254"], // reserved
  ["255.255.255.255", "255.255.255.255"], // broadcast
];

const ipv4ToInt = (ip: string): number =>
  ip
    .split(".")
    .map((octet) => parseInt(octet, 10))
    .reduce((acc, octet) => (acc << 8) + octet, 0);

const isIpv4Blocked = (ip: string): boolean => {
  const ipInt = ipv4ToInt(ip);
  return IPV4_BLOCKED_RANGES.some(([start, end]) => {
    const startInt = ipv4ToInt(start);
    const endInt = ipv4ToInt(end);
    return ipInt >= startInt && ipInt <= endInt;
  });
};

const isIpv6Blocked = (ip: string): boolean => {
  const normalized = ip.toLowerCase().split("%")[0];
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("ff")) return true; // multicast
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local
  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  )
    return true; // link-local fe80::/10
  if (normalized.startsWith("2001:db8")) return true; // documentation prefix
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.replace("::ffff:", "");
    if (isIP(mapped) === 4) return isIpv4Blocked(mapped);
  }
  return false;
};

export const isPrivateOrReservedIp = (ip: string): boolean => {
  const trimmed = ip.toLowerCase().split("%")[0];
  const ipVersion = isIP(trimmed);
  if (ipVersion === 4) return isIpv4Blocked(trimmed);
  if (ipVersion === 6) return isIpv6Blocked(trimmed);
  return true;
};

export class SsrfBlockedError extends Error {
  readonly code = "SSRF_BLOCKED";
}

const isBlockedHostname = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(normalized)) return true;
  return BLOCKED_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
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
  } catch (error) {
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

  if (isIP(hostname) && isPrivateOrReservedIp(hostname)) {
    throw new SsrfBlockedError("Private or reserved IPs are not allowed");
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
