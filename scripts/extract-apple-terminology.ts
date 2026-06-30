#!/usr/bin/env bun
/**
 * Regenerate ryOS terminology from the macOS 26 corpus indexed by
 * applelocalization-web.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

export const APPLE_LOCALIZATION_SOURCE = {
  repository: "https://github.com/kishikawakatsumi/applelocalization-web",
  api: "https://applelocalization.com/api/macos/26/search/advanced",
  platform: "macOS",
  version: "26",
} as const;

export const LOCALE_ORDER = [
  "zh-TW",
  "ja",
  "ko",
  "fr",
  "de",
  "es",
  "pt",
  "it",
  "ru",
] as const;

export type GlossaryLocale = (typeof LOCALE_ORDER)[number];
export type Terminology = Record<string, Record<GlossaryLocale, string>>;

const LANGUAGE_GROUPS = [
  "Traditional Chinese",
  "Japanese",
  "Korean",
  "French",
  "German",
  "Spanish",
  "Portuguese",
  "Italian",
  "Russian",
] as const;

/**
 * applelocalization-web language filters include regional and embedded-platform
 * variants. Keep only the desktop language codes that match ryOS's locales.
 */
const LOCALE_LANGUAGE_CODES: Record<GlossaryLocale, ReadonlySet<string>> = {
  "zh-TW": new Set(["zh_TW", "zh_TW-macos"]),
  ja: new Set(["ja", "ja-macos"]),
  ko: new Set(["ko", "ko-macos"]),
  fr: new Set(["fr", "fr-macos"]),
  de: new Set(["de", "de-macos"]),
  es: new Set(["es", "es-macos"]),
  pt: new Set(["pt_BR", "pt_BR-macos"]),
  it: new Set(["it", "it-macos"]),
  ru: new Set(["ru", "ru-macos"]),
};

export interface AppleLocalizationRow {
  source: string;
  target: string;
  language: string;
  file_name: string;
  bundle_name: string;
}

interface SearchResponse {
  data: AppleLocalizationRow[];
  last_page: number;
  total: number;
}

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

interface FetchOptions {
  apiUrl?: string;
  cacheDir?: string;
  fetchImpl?: FetchLike;
  retries?: number;
}

interface CliOptions extends FetchOptions {
  concurrency: number;
  output: string;
}

const SCRIPT_DIR = import.meta.dir;
const TERMS_FILE = join(SCRIPT_DIR, "apple-ui-terminology-terms.json");
const DEFAULT_OUTPUT_FILE = join(SCRIPT_DIR, "apple-ui-terminology-data.ts");
const PAGE_SIZE = 200;

function requireInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function readFlagValue(args: string[], index: number): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${args[index]} requires a value`);
  }
  return value;
}

export function parseCliOptions(args: string[]): CliOptions {
  const options: CliOptions = {
    apiUrl: APPLE_LOCALIZATION_SOURCE.api,
    concurrency: 4,
    output: DEFAULT_OUTPUT_FILE,
    retries: 3,
  };

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    switch (flag) {
      case "--api-url":
        options.apiUrl = readFlagValue(args, index);
        index += 1;
        break;
      case "--cache-dir":
        options.cacheDir = resolve(readFlagValue(args, index));
        index += 1;
        break;
      case "--concurrency":
        options.concurrency = requireInteger(
          readFlagValue(args, index),
          flag
        );
        index += 1;
        break;
      case "--output":
        options.output = resolve(readFlagValue(args, index));
        index += 1;
        break;
      case "--retries":
        options.retries = requireInteger(readFlagValue(args, index), flag);
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }

  return options;
}

export function buildSearchUrl(
  term: string,
  page: number,
  apiUrl = APPLE_LOCALIZATION_SOURCE.api
): string {
  const url = new URL(apiUrl);
  url.searchParams.set("c", "key");
  url.searchParams.set("o", "equal");
  url.searchParams.set("q", term);
  url.searchParams.set("size", String(PAGE_SIZE));
  url.searchParams.set("page", String(page));
  for (const language of LANGUAGE_GROUPS) {
    url.searchParams.append("l", language);
  }
  return url.toString();
}

function parseSearchResponse(value: unknown, url: string): SearchResponse {
  if (!value || typeof value !== "object") {
    throw new Error(`Invalid response from ${url}`);
  }

  const response = value as Partial<SearchResponse>;
  if (
    !Array.isArray(response.data) ||
    !Number.isInteger(response.last_page) ||
    !Number.isInteger(response.total) ||
    response.last_page! < 0 ||
    response.total! < 0
  ) {
    throw new Error(`Invalid response shape from ${url}`);
  }

  for (const row of response.data) {
    if (
      !row ||
      typeof row.source !== "string" ||
      typeof row.target !== "string" ||
      typeof row.language !== "string" ||
      typeof row.file_name !== "string" ||
      typeof row.bundle_name !== "string"
    ) {
      throw new Error(`Invalid result row from ${url}`);
    }
  }

  return response as SearchResponse;
}

function getCachePath(cacheDir: string, url: string): string {
  const digest = createHash("sha256").update(url).digest("hex");
  return join(cacheDir, `${digest}.json`);
}

async function fetchSearchPage(
  url: string,
  options: FetchOptions
): Promise<SearchResponse> {
  const cachePath = options.cacheDir
    ? getCachePath(options.cacheDir, url)
    : undefined;

  if (cachePath) {
    try {
      return parseSearchResponse(JSON.parse(await readFile(cachePath, "utf8")), url);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const retries = options.retries ?? 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const body = parseSearchResponse(await response.json(), url);
      if (cachePath) {
        await mkdir(dirname(cachePath), { recursive: true });
        await writeFile(cachePath, `${JSON.stringify(body)}\n`);
      }
      return body;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await Bun.sleep(1_000 * 2 ** (attempt - 1));
      }
    }
  }

  throw new Error(
    `Failed to fetch ${url} after ${retries} attempts`,
    { cause: lastError }
  );
}

function localeForLanguage(language: string): GlossaryLocale | undefined {
  return LOCALE_ORDER.find((locale) =>
    LOCALE_LANGUAGE_CODES[locale].has(language)
  );
}

export function selectDominantTranslations(
  term: string,
  rows: AppleLocalizationRow[]
): Record<GlossaryLocale, string> {
  const counts = Object.fromEntries(
    LOCALE_ORDER.map((locale) => [locale, new Map<string, number>()])
  ) as Record<GlossaryLocale, Map<string, number>>;

  for (const row of rows) {
    if (row.source !== term) continue;
    const locale = localeForLanguage(row.language);
    const localized = row.target.trim();
    if (!locale || !localized) continue;
    counts[locale].set(localized, (counts[locale].get(localized) ?? 0) + 1);
  }

  return Object.fromEntries(
    LOCALE_ORDER.map((locale) => {
      const ranked = [...counts[locale].entries()].sort(
        ([leftValue, leftCount], [rightValue, rightCount]) =>
          rightCount - leftCount ||
          (leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0)
      );
      if (!ranked.length) {
        throw new Error(`No macOS 26 "${term}" entry for ${locale}`);
      }

      const [localized, topCount] = ranked[0];
      const total = ranked.reduce((sum, [, count]) => sum + count, 0);
      const confidence = topCount / total;
      if (confidence < 0.8) {
        console.warn(
          `warning: "${term}" in ${locale} has ${(
            confidence * 100
          ).toFixed(0)}% dominant-term confidence`
        );
      }
      return [locale, localized];
    })
  ) as Record<GlossaryLocale, string>;
}

export async function fetchTermTranslations(
  term: string,
  options: FetchOptions = {}
): Promise<Record<GlossaryLocale, string>> {
  const firstPage = await fetchSearchPage(
    buildSearchUrl(term, 1, options.apiUrl),
    options
  );
  const remainingPages = await Promise.all(
    Array.from({ length: Math.max(firstPage.last_page - 1, 0) }, (_, index) =>
      fetchSearchPage(
        buildSearchUrl(term, index + 2, options.apiUrl),
        options
      )
    )
  );
  const pages = [firstPage, ...remainingPages];
  const rows = pages.flatMap((page) => page.data);

  if (rows.length !== firstPage.total) {
    throw new Error(
      `Expected ${firstPage.total} macOS 26 rows for "${term}", received ${rows.length}`
    );
  }
  return selectDominantTranslations(term, rows);
}

export async function extractTerminology(
  terms: string[],
  options: FetchOptions & { concurrency?: number } = {}
): Promise<Terminology> {
  if (new Set(terms).size !== terms.length) {
    throw new Error(`${basename(TERMS_FILE)} contains duplicate terms`);
  }

  const concurrency = options.concurrency ?? 4;
  const terminology: Terminology = {};
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < terms.length) {
      const index = nextIndex;
      nextIndex += 1;
      const term = terms[index];
      terminology[term] = await fetchTermTranslations(term, options);
      console.log(`Fetched ${index + 1}/${terms.length}: ${term}`);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, terms.length) }, () => worker())
  );

  return Object.fromEntries(
    terms.map((term) => [term, terminology[term]])
  ) as Terminology;
}

export function renderTypescript(terminology: Terminology): string {
  return `/**
 * Generated from the macOS 26 localization corpus indexed by
 * applelocalization-web.
 *
 * English keys are exact source-string matches. Localized values are the
 * dominant trimmed translations for ryOS's desktop locale variants.
 * Regenerate with \`bun run i18n:apple-glossary\`.
 */

export const APPLE_GLOSSARY_SOURCE = ${JSON.stringify(
    APPLE_LOCALIZATION_SOURCE,
    null,
    2
  )} as const;

export const RAW_APPLE_UI_TERMINOLOGY = ${JSON.stringify(
    terminology,
    null,
    2
  )} as const;
`;
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const terms = JSON.parse(await readFile(TERMS_FILE, "utf8")) as unknown;
  if (
    !Array.isArray(terms) ||
    terms.some((term) => typeof term !== "string" || !term)
  ) {
    throw new Error(`${basename(TERMS_FILE)} must contain non-empty strings`);
  }

  const terminology = await extractTerminology(terms, options);
  const output = resolve(options.output);
  const temporaryOutput = `${output}.tmp`;
  await writeFile(temporaryOutput, renderTypescript(terminology));
  await rename(temporaryOutput, output);
  console.log(`Wrote ${terms.length} macOS 26 terms to ${output}`);
}

if (import.meta.main) {
  await main();
}
