import type { ConverterFunction } from "opencc-js/core";

export type ChineseScriptVariant = "traditional" | "simplified";

export interface GeocodeLocaleResolution {
  /** Value for the Nominatim `Accept-Language` header. */
  acceptLanguage: string | undefined;
  /** When set, place names with Chinese characters are converted to this script. */
  chineseScript: ChineseScriptVariant | null;
}

const CHINESE_TEXT_REGEX = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

function splitNominatimVariants(raw: string): string[] {
  return raw
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

async function pickChineseVariant(
  variants: string[],
  script: ChineseScriptVariant
): Promise<string> {
  const convert = await loadChineseConverter(script);
  const isStable = (variant: string) => convert(variant) === variant;

  const stable = variants.find((variant) => CHINESE_TEXT_REGEX.test(variant) && isStable(variant));
  if (stable) return stable;

  const chinese = variants.find((variant) => CHINESE_TEXT_REGEX.test(variant));
  return convert(chinese ?? variants[0]);
}

/**
 * Nominatim sometimes returns multiple script variants in one string
 * (e.g. "圣马特奥;聖馬特奧;聖馬刁"). Pick the best label for the locale.
 */
export async function resolveNominatimPlaceName(
  raw: string,
  locale?: string
): Promise<string> {
  const trimmed = raw.trim();
  if (!trimmed) return raw;

  const variants = splitNominatimVariants(trimmed);
  const { chineseScript } = resolveGeocodeLocale(locale);

  if (variants.length > 1) {
    const latin = variants.find((variant) => !CHINESE_TEXT_REGEX.test(variant));
    if (!chineseScript && latin) return latin;
    if (chineseScript) return pickChineseVariant(variants, chineseScript);
    return variants[0];
  }

  return applyChineseScript(trimmed, locale);
}

async function applyChineseScript(
  name: string,
  locale?: string
): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) return name;

  const { chineseScript } = resolveGeocodeLocale(locale);
  if (!chineseScript || !CHINESE_TEXT_REGEX.test(trimmed)) {
    return name;
  }

  const convert = await loadChineseConverter(chineseScript);
  return convert(trimmed);
}

/**
 * Pick the most display-friendly address field from a Nominatim reverse payload.
 * When the city label is a multi-script bundle, prefer the county name instead.
 */
export function pickNominatimAddressName(address: {
  city?: string;
  town?: string;
  village?: string;
  county?: string;
}): string | null {
  const city = address.city?.trim();
  const county = address.county?.trim();
  if (city && city.includes(";") && county) return county;

  return city || address.town?.trim() || address.village?.trim() || county || null;
}

let traditionalConverterPromise: Promise<ConverterFunction> | null = null;
let simplifiedConverterPromise: Promise<ConverterFunction> | null = null;

/**
 * Map a BCP-47 locale to the best Nominatim `Accept-Language` header and any
 * post-processing needed for Chinese script variants.
 */
export function resolveGeocodeLocale(locale?: string): GeocodeLocaleResolution {
  if (!locale?.trim()) {
    return { acceptLanguage: undefined, chineseScript: null };
  }

  const normalized = locale.trim().replaceAll("_", "-");
  const lower = normalized.toLowerCase();
  const subtags = lower.split("-");
  const langCode = subtags[0];

  if (langCode === "zh") {
    const isTraditional =
      subtags.includes("hant") ||
      subtags.some((subtag) => ["tw", "hk", "mo"].includes(subtag));
    if (isTraditional) {
      return { acceptLanguage: "zh-TW,zh;q=0.9", chineseScript: "traditional" };
    }
    return { acceptLanguage: "zh-CN,zh;q=0.9", chineseScript: "simplified" };
  }

  if (langCode === "ja") {
    return { acceptLanguage: "ja,en;q=0.5", chineseScript: null };
  }

  if (langCode === "en") {
    return { acceptLanguage: "en", chineseScript: null };
  }

  return { acceptLanguage: normalized, chineseScript: null };
}

async function loadChineseConverter(
  script: ChineseScriptVariant
): Promise<ConverterFunction> {
  if (script === "traditional") {
    traditionalConverterPromise ??= import("opencc-js/cn2t").then(({ Converter }) =>
      Converter({ from: "cn", to: "twp" })
    );
    return traditionalConverterPromise;
  }

  simplifiedConverterPromise ??= import("opencc-js/t2cn").then(({ Converter }) =>
    Converter({ from: "twp", to: "cn" })
  );
  return simplifiedConverterPromise;
}

/**
 * Apply Chinese script conversion when the requested locale calls for it.
 * Non-Chinese text (e.g. "San Mateo County", "Suginami") is returned unchanged.
 */
export async function localizePlaceName(
  name: string,
  locale?: string
): Promise<string> {
  return resolveNominatimPlaceName(name, locale);
}
