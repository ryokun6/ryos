export { formatDateLabel } from "@/utils/formatDateLabel";

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function isLikelyIsoAlpha2(value: string): boolean {
  return /^[A-Za-z]{2}$/.test(value);
}

function countryCodeToFlagEmoji(code: string): string {
  const upper = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "";
  const A = 0x1f1e6;
  const codePoints = [
    A + (upper.charCodeAt(0) - "A".charCodeAt(0)),
    A + (upper.charCodeAt(1) - "A".charCodeAt(0)),
  ];
  return String.fromCodePoint(...codePoints);
}

export function formatCountryDisplay(
  raw: string,
  locale: string
): { flag: string; name: string } {
  const trimmed = raw.trim();
  if (isLikelyIsoAlpha2(trimmed)) {
    const code = trimmed.toUpperCase();
    let name = code;
    try {
      const display = new Intl.DisplayNames([locale], { type: "region" });
      name = display.of(code) ?? code;
    } catch {
      name = code;
    }
    return { flag: countryCodeToFlagEmoji(code), name };
  }
  return { flag: "", name: trimmed };
}
