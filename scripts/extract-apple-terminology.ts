#!/usr/bin/env bun
/**
 * Regenerate ryOS terminology from the raw macOS 26.1 localization corpus
 * published by the applelocalization project.
 */
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

export const APPLE_LOCALIZATION_SOURCE = {
  websiteRepository:
    "https://github.com/kishikawakatsumi/applelocalization-web",
  dataRepository:
    "https://github.com/kishikawakatsumi/applelocalization-tools",
  revision: "95fff5dfcf53ed5b849756865e8e5c4c327f9bc7",
  tree: "e03797c80f73806faeec8ff16b666b1b74ba48d3",
  path: "data/macos/26.1",
  platform: "macOS",
  version: "26.1",
} as const;

export const LOCALE_ORDER = [
  "zh-CN",
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

/**
 * The raw corpus contains regional and embedded-platform variants. Keep only
 * the desktop language codes that match ryOS's locales.
 */
const LOCALE_LANGUAGE_CODES: Record<GlossaryLocale, ReadonlySet<string>> = {
  "zh-CN": new Set(["zh_CN", "zh_CN-macos"]),
  "zh-TW": new Set(["zh_TW", "zh_TW-macos"]),
  ja: new Set(["Japanese", "ja", "ja-macos"]),
  ko: new Set(["ko", "ko-macos"]),
  fr: new Set(["French", "fr", "fr-macos"]),
  de: new Set(["German", "de", "de-macos"]),
  es: new Set(["Spanish", "es", "es-macos"]),
  pt: new Set(["pt", "pt_BR", "pt_BR-macos"]),
  it: new Set(["Italian", "it", "it-macos"]),
  ru: new Set(["ru", "ru-macos"]),
};

const TERM_FRAMEWORK_HINTS: Partial<Record<string, RegExp>> = {
  Playlists: /^(?:MusicKitInternal|_MusicKitInternal_SwiftUI)\.framework$/u,
};
const TERM_TRANSLATION_PREFERENCES: Partial<
  Record<string, Partial<Record<GlossaryLocale, string>>>
> = {
  "Set Password": { de: "Passwort festlegen" },
  "Sign In": { ru: "Войти" },
};
const ELLIPSIS_SUFFIX = /(?:\.\.\.|…|⋯)$/u;

export interface RawLocalization {
  filename: string;
  language: string;
  target: string;
}

export interface RawLocalizationDocument {
  bundlePath: string;
  framework: string;
  localizations: Record<string, RawLocalization[]>;
  loctablePath?: string;
}

interface GithubTreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
}

interface GithubTreeResponse {
  sha: string;
  tree: GithubTreeEntry[];
  truncated: boolean;
}

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

interface ExtractionOptions {
  cacheDir?: string;
  concurrency?: number;
  fetchImpl?: FetchLike;
  manifestUrl?: string;
  rawBaseUrl?: string;
  retries?: number;
  sourceDir?: string;
}

interface CliOptions extends ExtractionOptions {
  concurrency: number;
  output: string;
  retries: number;
}

type LocaleCounts = Record<GlossaryLocale, Map<string, number>>;
type TermCounts = Record<string, LocaleCounts>;

const SCRIPT_DIR = import.meta.dir;
const TERMS_FILE = join(SCRIPT_DIR, "apple-ui-terminology-terms.json");
const DEFAULT_OUTPUT_FILE = join(SCRIPT_DIR, "apple-ui-terminology-data.ts");
const DEFAULT_CONCURRENCY = 16;
const GITHUB_API_ROOT = "https://api.github.com/repos";
const RAW_GITHUB_ROOT = "https://raw.githubusercontent.com";
const REPOSITORY_PATH = "kishikawakatsumi/applelocalization-tools";
const DEFAULT_MANIFEST_URL = `${GITHUB_API_ROOT}/${REPOSITORY_PATH}/git/trees/${APPLE_LOCALIZATION_SOURCE.tree}`;
const DEFAULT_RAW_BASE_URL = `${RAW_GITHUB_ROOT}/${REPOSITORY_PATH}/${APPLE_LOCALIZATION_SOURCE.revision}/${APPLE_LOCALIZATION_SOURCE.path}`;

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
    concurrency: DEFAULT_CONCURRENCY,
    output: DEFAULT_OUTPUT_FILE,
    retries: 3,
  };

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    switch (flag) {
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
      case "--manifest-url":
        options.manifestUrl = readFlagValue(args, index);
        index += 1;
        break;
      case "--output":
        options.output = resolve(readFlagValue(args, index));
        index += 1;
        break;
      case "--raw-base-url":
        options.rawBaseUrl = readFlagValue(args, index);
        index += 1;
        break;
      case "--retries":
        options.retries = requireInteger(readFlagValue(args, index), flag);
        index += 1;
        break;
      case "--source-dir":
        options.sourceDir = resolve(readFlagValue(args, index));
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }

  return options;
}

export function buildRawFileUrl(
  file: string,
  rawBaseUrl = DEFAULT_RAW_BASE_URL
): string {
  const encodedFile = file.split("/").map(encodeURIComponent).join("/");
  return `${rawBaseUrl.replace(/\/$/u, "")}/${encodedFile}`;
}

function parseRawDocument(
  value: unknown,
  source: string
): RawLocalizationDocument {
  if (!value || typeof value !== "object") {
    throw new Error(`Invalid localization document from ${source}`);
  }

  const document = value as Partial<RawLocalizationDocument>;
  if (
    typeof document.bundlePath !== "string" ||
    typeof document.framework !== "string" ||
    !document.localizations ||
    typeof document.localizations !== "object"
  ) {
    throw new Error(`Invalid localization document shape from ${source}`);
  }

  for (const localizations of Object.values(document.localizations)) {
    if (
      !Array.isArray(localizations) ||
      localizations.some(
        (localization) =>
          !localization ||
          typeof localization.filename !== "string" ||
          typeof localization.language !== "string" ||
          typeof localization.target !== "string"
      )
    ) {
      throw new Error(`Invalid localization rows from ${source}`);
    }
  }

  return document as RawLocalizationDocument;
}

function parseManifest(value: unknown, source: string): GithubTreeEntry[] {
  if (!value || typeof value !== "object") {
    throw new Error(`Invalid GitHub tree response from ${source}`);
  }

  const response = value as Partial<GithubTreeResponse>;
  if (
    typeof response.sha !== "string" ||
    !Array.isArray(response.tree) ||
    typeof response.truncated !== "boolean"
  ) {
    throw new Error(`Invalid GitHub tree response shape from ${source}`);
  }
  if (response.truncated) {
    throw new Error(`GitHub tree response is truncated: ${source}`);
  }

  const files = response.tree.filter(
    (entry) => entry.type === "blob" && entry.path.endsWith(".json")
  );
  if (!files.length) {
    throw new Error(`No localization JSON files found in ${source}`);
  }
  for (const file of files) {
    if (
      typeof file.path !== "string" ||
      typeof file.sha !== "string" ||
      (file.size !== undefined && !Number.isInteger(file.size))
    ) {
      throw new Error(`Invalid GitHub tree entry from ${source}`);
    }
  }
  return files;
}

async function fetchJson(
  url: string,
  options: ExtractionOptions,
  parse: (value: unknown, source: string) => unknown
): Promise<unknown> {
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
      return parse(await response.json(), url);
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

async function readRemoteDocument(
  file: GithubTreeEntry,
  options: ExtractionOptions
): Promise<RawLocalizationDocument> {
  const cachePath = options.cacheDir
    ? join(options.cacheDir, `${file.sha}.json`)
    : undefined;
  if (cachePath) {
    try {
      return parseRawDocument(
        JSON.parse(await readFile(cachePath, "utf8")),
        cachePath
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  const url = buildRawFileUrl(file.path, options.rawBaseUrl);
  const document = (await fetchJson(
    url,
    options,
    parseRawDocument
  )) as RawLocalizationDocument;
  if (cachePath) {
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, `${JSON.stringify(document)}\n`);
  }
  return document;
}

function createLocaleCounts(): LocaleCounts {
  return Object.fromEntries(
    LOCALE_ORDER.map((locale) => [locale, new Map<string, number>()])
  ) as LocaleCounts;
}

function localeForLanguage(language: string): GlossaryLocale | undefined {
  return LOCALE_ORDER.find((locale) =>
    LOCALE_LANGUAGE_CODES[locale].has(language)
  );
}

export function collectDocumentTranslations(
  document: RawLocalizationDocument,
  terms: ReadonlySet<string>,
  counts: TermCounts
): void {
  for (const [term, localizations] of Object.entries(document.localizations)) {
    if (!terms.has(term)) continue;
    const frameworkHint = TERM_FRAMEWORK_HINTS[term];
    if (frameworkHint && !frameworkHint.test(document.framework)) continue;

    for (const localization of localizations) {
      const locale = localeForLanguage(localization.language);
      const localized = localization.target.trim();
      if (
        !locale ||
        !localized ||
        (!ELLIPSIS_SUFFIX.test(term) && ELLIPSIS_SUFFIX.test(localized))
      ) {
        continue;
      }
      const localeCounts = counts[term][locale];
      localeCounts.set(localized, (localeCounts.get(localized) ?? 0) + 1);
    }
  }
}

function selectDominantTranslation(
  term: string,
  locale: GlossaryLocale,
  counts: Map<string, number>
): string | null {
  const preferred = TERM_TRANSLATION_PREFERENCES[term]?.[locale];
  if (preferred !== undefined) {
    if (!counts.has(preferred)) {
      throw new Error(
        `Preferred macOS 26.1 translation is unavailable: "${term}" (${locale}) → "${preferred}"`
      );
    }
    return preferred;
  }

  const ranked = [...counts.entries()].sort(
    ([leftValue, leftCount], [rightValue, rightCount]) =>
      rightCount - leftCount ||
      (leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0)
  );
  if (!ranked.length) {
    return null;
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
  return localized;
}

function createTermCounts(terms: string[]): TermCounts {
  return Object.fromEntries(
    terms.map((term) => [term, createLocaleCounts()])
  ) as TermCounts;
}

export function buildTerminology(
  terms: string[],
  counts: TermCounts
): Terminology {
  const missing: string[] = [];
  const terminology = Object.fromEntries(
    terms.map((term) => {
      const translations = Object.fromEntries(
        LOCALE_ORDER.flatMap((locale) => {
          const translation = selectDominantTranslation(
            term,
            locale,
            counts[term][locale]
          );
          if (translation === null) {
            missing.push(`"${term}" (${locale})`);
            return [];
          }
          return [[locale, translation]];
        })
      );
      return [term, translations];
    })
  );

  if (missing.length) {
    throw new Error(
      `No macOS 26.1 entries for ${missing.length} term/locale pairs:\n${missing.join(
        "\n"
      )}`
    );
  }
  return terminology as Terminology;
}

export function extractTerminologyFromDocuments(
  terms: string[],
  documents: RawLocalizationDocument[]
): Terminology {
  const termSet = new Set(terms);
  if (termSet.size !== terms.length) {
    throw new Error(`${basename(TERMS_FILE)} contains duplicate terms`);
  }
  const counts = createTermCounts(terms);
  for (const document of documents) {
    collectDocumentTranslations(document, termSet, counts);
  }
  return buildTerminology(terms, counts);
}

async function processWithConcurrency<T>(
  items: T[],
  concurrency: number,
  process: (item: T, index: number) => Promise<void>
): Promise<void> {
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await process(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
}

export async function extractTerminology(
  terms: string[],
  options: ExtractionOptions = {}
): Promise<Terminology> {
  const termSet = new Set(terms);
  if (termSet.size !== terms.length) {
    throw new Error(`${basename(TERMS_FILE)} contains duplicate terms`);
  }
  const counts = createTermCounts(terms);
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  let processed = 0;

  if (options.sourceDir) {
    const files = (await readdir(options.sourceDir))
      .filter((file) => file.endsWith(".json"))
      .sort();
    if (!files.length) {
      throw new Error(`No localization JSON files found in ${options.sourceDir}`);
    }
    await processWithConcurrency(files, concurrency, async (file) => {
      const path = join(options.sourceDir!, file);
      const document = parseRawDocument(
        JSON.parse(await readFile(path, "utf8")),
        path
      );
      collectDocumentTranslations(document, termSet, counts);
      processed += 1;
      if (processed % 100 === 0 || processed === files.length) {
        console.log(`Processed ${processed}/${files.length} raw files`);
      }
    });
  } else {
    const manifestUrl = options.manifestUrl ?? DEFAULT_MANIFEST_URL;
    const files = parseManifest(
      await fetchJson(manifestUrl, options, (value) => value),
      manifestUrl
    );
    await processWithConcurrency(files, concurrency, async (file) => {
      const document = await readRemoteDocument(file, options);
      collectDocumentTranslations(document, termSet, counts);
      processed += 1;
      if (processed % 100 === 0 || processed === files.length) {
        console.log(`Processed ${processed}/${files.length} raw files`);
      }
    });
  }

  return buildTerminology(terms, counts);
}

export function renderTypescript(terminology: Terminology): string {
  return `/**
 * Generated from applelocalization's raw macOS 26.1 localization corpus.
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
  console.log(`Wrote ${terms.length} macOS 26.1 terms to ${output}`);
}

if (import.meta.main) {
  await main();
}
