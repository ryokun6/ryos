import { isIP } from "node:net";

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

const normalizeIpInput = (ip: string): string => {
  const trimmed = ip.trim().toLowerCase();
  const unbracketed =
    trimmed.startsWith("[") && trimmed.endsWith("]")
      ? trimmed.slice(1, -1)
      : trimmed;
  return unbracketed.split("%")[0];
};

const isIpv4Blocked = (ip: string): boolean => {
  const ipInt = ipv4ToInt(ip);
  return IPV4_BLOCKED_RANGES.some(([start, end]) => {
    const startInt = ipv4ToInt(start);
    const endInt = ipv4ToInt(end);
    return ipInt >= startInt && ipInt <= endInt;
  });
};

const parseIpv6Part = (part: string): number[] | null => {
  if (!part) return [];

  const pieces = part.split(":");
  const hextets: number[] = [];

  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index];
    if (!piece) return null;

    if (piece.includes(".")) {
      if (index !== pieces.length - 1 || isIP(piece) !== 4) return null;
      const ipv4Int = ipv4ToInt(piece);
      hextets.push((ipv4Int >>> 16) & 0xffff, ipv4Int & 0xffff);
      continue;
    }

    if (!/^[0-9a-f]{1,4}$/.test(piece)) return null;
    hextets.push(parseInt(piece, 16));
  }

  return hextets;
};

const parseIpv6Hextets = (ip: string): number[] | null => {
  const compressionParts = ip.split("::");
  if (compressionParts.length > 2) return null;

  const head = parseIpv6Part(compressionParts[0]);
  const tail = parseIpv6Part(compressionParts[1] ?? "");
  if (!head || !tail) return null;

  if (compressionParts.length === 1) {
    return head.length === 8 ? head : null;
  }

  const missing = 8 - head.length - tail.length;
  if (missing < 1) return null;

  return [...head, ...Array(missing).fill(0), ...tail];
};

const getMappedIpv4FromIpv6 = (hextets: number[]): string | null => {
  const isMapped =
    hextets.slice(0, 5).every((hextet) => hextet === 0) &&
    hextets[5] === 0xffff;
  if (!isMapped) return null;

  const ipv4Int = hextets[6] * 0x10000 + hextets[7];
  return [
    (ipv4Int >>> 24) & 0xff,
    (ipv4Int >>> 16) & 0xff,
    (ipv4Int >>> 8) & 0xff,
    ipv4Int & 0xff,
  ].join(".");
};

const isIpv6Blocked = (ip: string): boolean => {
  const hextets = parseIpv6Hextets(ip);
  if (!hextets) return true;

  if (hextets.every((hextet) => hextet === 0)) return true; // unspecified
  if (hextets.slice(0, 7).every((hextet) => hextet === 0) && hextets[7] === 1) {
    return true; // loopback
  }

  const mappedIpv4 = getMappedIpv4FromIpv6(hextets);
  if (mappedIpv4) return isIpv4Blocked(mappedIpv4);

  const first = hextets[0];
  if ((first & 0xff00) === 0xff00) return true; // multicast ff00::/8
  if ((first & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((first & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if (hextets[0] === 0x2001 && hextets[1] === 0x0db8) return true; // docs

  return false;
};

export const isPrivateOrReservedIp = (ip: string): boolean => {
  const trimmed = normalizeIpInput(ip);
  const ipVersion = isIP(trimmed);
  if (ipVersion === 4) return isIpv4Blocked(trimmed);
  if (ipVersion === 6) return isIpv6Blocked(trimmed);
  return true;
};
