#!/usr/bin/env bun

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  APPLE_UI_TERMINOLOGY,
  getExpectedAppleUiTerm,
  TRANSLATION_LOCALES,
  type TranslationLocale,
} from "./apple-ui-terminology";

type TranslationObject = {
  [key: string]: string | TranslationObject;
};

type FlatTranslations = Record<string, string>;

export interface TranslationAuditIssue {
  locale: TranslationLocale;
  key: string;
  kind:
    | "extra-key"
    | "missing-key"
    | "placeholder"
    | "terminology"
    | "todo"
    | "untranslated";
  message: string;
}

const LOCALES_DIR = join(process.cwd(), "src/lib/locales");
const ENGLISH_FILE = join(LOCALES_DIR, "en/translation.json");
const OPTIONAL_PLACEHOLDERS = new Set(["plural", "newPlural"]);
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/u;

const PLURAL_OVERRIDES: Partial<
  Record<TranslationLocale, Record<string, string>>
> = {
  ru: {
    "apps.admin.statusBar.auditLogCount_few": "{{count}} записи",
    "apps.admin.statusBar.redisKeysCount_few": "{{count}} ключа",
    "apps.ipod.menuItems.playlistTrackCount_few": "{{count}} песни",
    "apps.tv.toasts.importSuccess_few":
      "Импортировано {{count}} канала ({{skipped}} пропущено)",
  },
};

type RequiredKeyTranslations = Record<
  string,
  Record<TranslationLocale, string>
>;

/**
 * Key-specific translations that cannot be inferred from a standalone term.
 * Product names such as Cursor and ryOS intentionally remain unchanged.
 */
export const REQUIRED_KEY_TRANSLATIONS = {
  "apps.chats.toolCalls.listCursorCloudAgentRuns.listed": {
    "zh-TW": "已列出最近的 {{count}} 次執行。",
    ja: "最近の実行を {{count}} 件表示しました。",
    ko: "최근 실행 {{count}}개를 표시했습니다.",
    fr: "Exécutions récentes répertoriées : {{count}}.",
    de: "Anzahl der aufgelisteten letzten Ausführungen: {{count}}.",
    es: "Ejecuciones recientes mostradas: {{count}}.",
    pt: "Execuções recentes listadas: {{count}}.",
    it: "Esecuzioni recenti elencate: {{count}}.",
    ru: "Показано недавних запусков: {{count}}.",
  },
  "apps.chats.toolCalls.listCursorCloudAgentRuns.loading": {
    "zh-TW": "正在列出 Cursor Cloud 代理執行…",
    ja: "Cursor Cloud エージェントの実行を一覧表示中…",
    ko: "Cursor Cloud 에이전트 실행 목록을 불러오는 중…",
    fr: "Liste des exécutions de l’agent Cursor Cloud…",
    de: "Cursor Cloud-Agent-Ausführungen werden aufgelistet…",
    es: "Mostrando ejecuciones del agente de Cursor Cloud…",
    pt: "Listando execuções do agente do Cursor Cloud…",
    it: "Elenco delle esecuzioni dell’agente Cursor Cloud…",
    ru: "Загрузка запусков агента Cursor Cloud…",
  },
  "apps.chats.toolCalls.listCursorCloudAgentRuns.openDashboard": {
    "zh-TW": "在 Cursor 中打開代理",
    ja: "Cursor でエージェントを開く",
    ko: "Cursor에서 에이전트 열기",
    fr: "Ouvrir l’agent dans Cursor",
    de: "Agent in Cursor öffnen",
    es: "Abrir agente en Cursor",
    pt: "Abrir agente no Cursor",
    it: "Apri l’agente in Cursor",
    ru: "Открыть агента в Cursor",
  },
  "apps.chats.toolCalls.listCursorCloudAgentRuns.truncatedHint": {
    "zh-TW": "（列表可能已截斷）",
    ja: "（一覧は省略されている場合があります）",
    ko: "(목록이 일부 생략되었을 수 있음)",
    fr: "(la liste peut être tronquée)",
    de: "(Liste ist möglicherweise gekürzt)",
    es: "(la lista puede estar truncada)",
    pt: "(a lista pode estar truncada)",
    it: "(l’elenco potrebbe essere troncato)",
    ru: "(список может быть неполным)",
  },
  "apps.ipod.menuItems.playlistTrackCount_one": {
    "zh-TW": "{{count}} 首歌曲",
    ja: "{{count}}曲",
    ko: "{{count}}곡",
    fr: "{{count}} morceau",
    de: "{{count}} Titel",
    es: "{{count}} canción",
    pt: "{{count}} música",
    it: "{{count}} brano",
    ru: "{{count}} песня",
  },
  "apps.ipod.menuItems.playlistTrackCount_other": {
    "zh-TW": "{{count}} 首歌曲",
    ja: "{{count}}曲",
    ko: "{{count}}곡",
    fr: "{{count}} morceaux",
    de: "{{count}} Titel",
    es: "{{count}} canciones",
    pt: "{{count}} músicas",
    it: "{{count}} brani",
    ru: "{{count}} песен",
  },
  "common.startMenu.ryosProfessional": {
    "zh-TW": "專業版",
    ja: "プロフェッショナル",
    ko: "프로페셔널",
    fr: "Professionnel",
    de: "Professionell",
    es: "Profesional",
    pt: "Profissional",
    it: "Professionale",
    ru: "Профессиональная",
  },
  "settings.language.portuguese": {
    "zh-TW": "Português (Brasil)",
    ja: "Português (Brasil)",
    ko: "Português (Brasil)",
    fr: "Português (Brasil)",
    de: "Português (Brasil)",
    es: "Português (Brasil)",
    pt: "Português (Brasil)",
    it: "Português (Brasil)",
    ru: "Português (Brasil)",
  },
  "apps.ipod.dialogs.autoUpdatedTrackMetadata": {
    "zh-TW": "已自動更新 {{count}} 首曲目的中繼資料",
    ja: "{{count}}曲のメタデータを自動更新しました",
    ko: "트랙 메타데이터 {{count}}개 자동 업데이트됨",
    fr: "Métadonnées de pistes mises à jour automatiquement : {{count}}",
    de: "Automatisch aktualisierte Titelmetadaten: {{count}}",
    es: "Metadatos de pistas actualizados automáticamente: {{count}}",
    pt: "Metadados de faixas atualizados automaticamente: {{count}}",
    it: "Metadati dei brani aggiornati automaticamente: {{count}}",
    ru: "Метаданные треков обновлены: {{count}}",
  },
  "apps.ipod.dialogs.libraryUpToDateWithSongs": {
    "zh-TW": "資料庫已是最新版本，共 {{count}} 首歌曲",
    ja: "ライブラリは{{count}}曲で最新です",
    ko: "라이브러리가 총 {{count}}곡으로 최신 상태입니다",
    fr: "La bibliothèque est à jour. Morceaux : {{count}}",
    de: "Die Mediathek ist auf dem neuesten Stand. Titel: {{count}}",
    es: "La biblioteca está actualizada. Canciones: {{count}}",
    pt: "A biblioteca está atualizada. Músicas: {{count}}",
    it: "La libreria è aggiornata. Brani: {{count}}",
    ru: "Медиатека обновлена. Количество песен: {{count}}",
  },
} as const satisfies RequiredKeyTranslations;

function flattenTranslations(
  object: TranslationObject,
  prefix = ""
): FlatTranslations {
  const result: FlatTranslations = {};

  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      result[path] = value;
    } else {
      Object.assign(result, flattenTranslations(value, path));
    }
  }

  return result;
}

function setNestedValue(
  object: TranslationObject,
  path: string,
  value: string
): void {
  const parts = path.split(".");
  let current = object;

  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (!next || typeof next === "string") {
      current[part] = {};
    }
    current = current[part] as TranslationObject;
  }

  current[parts.at(-1)!] = value;
}

function pluralCategories(locale: TranslationLocale): Set<string> {
  const localeName = locale === "pt" ? "pt-BR" : locale;
  return new Set(
    new Intl.PluralRules(localeName).resolvedOptions().pluralCategories
  );
}

function hasEnglishPluralPair(
  base: string,
  englishKeys: Set<string>
): boolean {
  if (!englishKeys.has(`${base}_one`)) {
    return false;
  }

  return englishKeys.has(`${base}_other`) || englishKeys.has(base);
}

function isLocalePluralKey(
  key: string,
  locale: TranslationLocale,
  englishKeys: Set<string>
): boolean {
  const match = key.match(PLURAL_SUFFIX);
  if (!match) {
    return false;
  }

  const base = key.slice(0, -match[0].length);
  return (
    pluralCategories(locale).has(match[1]) &&
    hasEnglishPluralPair(base, englishKeys)
  );
}

function removeExtraKeys(
  source: TranslationObject,
  target: TranslationObject,
  locale: TranslationLocale,
  englishKeys: Set<string>,
  prefix = ""
): void {
  for (const key of Object.keys(target)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (!(key in source)) {
      if (!isLocalePluralKey(path, locale, englishKeys)) {
        delete target[key];
      }
      continue;
    }

    const sourceValue = source[key];
    const targetValue = target[key];
    if (
      typeof sourceValue !== "string" &&
      typeof targetValue !== "string"
    ) {
      removeExtraKeys(sourceValue, targetValue, locale, englishKeys, path);
    }
  }
}

function ensureLocalePluralForms(
  locale: TranslationLocale,
  english: FlatTranslations,
  targetObject: TranslationObject
): void {
  const target = flattenTranslations(targetObject);

  for (const key of Object.keys(english)) {
    if (!key.endsWith("_other")) {
      continue;
    }

    const base = key.slice(0, -"_other".length);
    if (!(`${base}_one` in english)) {
      continue;
    }

    for (const category of pluralCategories(locale)) {
      const pluralKey = `${base}_${category}`;
      if (target[pluralKey]) {
        continue;
      }

      const value =
        PLURAL_OVERRIDES[locale]?.[pluralKey] ?? target[`${base}_other`];
      if (value) {
        setNestedValue(targetObject, pluralKey, value);
      }
    }
  }
}

function placeholders(value: string): Set<string> {
  return new Set(
    Array.from(
      value.matchAll(/\{\{\s*([^},\s]+)[^}]*\}\}/gu),
      (match) => match[1]
    )
  );
}

function auditLocale(
  locale: TranslationLocale,
  english: FlatTranslations,
  target: FlatTranslations
): TranslationAuditIssue[] {
  const issues: TranslationAuditIssue[] = [];
  const englishKeys = new Set(Object.keys(english));
  const targetKeys = new Set(Object.keys(target));

  for (const key of englishKeys) {
    if (!targetKeys.has(key)) {
      issues.push({
        locale,
        key,
        kind: "missing-key",
        message: "key is missing",
      });
      continue;
    }

    const englishValue = english[key];
    const targetValue = target[key];

    if (targetValue.startsWith("[TODO]")) {
      issues.push({
        locale,
        key,
        kind: "todo",
        message: "translation is still marked [TODO]",
      });
    }

    const expectedTerm = getExpectedAppleUiTerm(englishValue, locale, key);
    if (
      expectedTerm &&
      targetValue.normalize("NFC") !== expectedTerm.normalize("NFC")
    ) {
      issues.push({
        locale,
        key,
        kind: "terminology",
        message: `expected "${expectedTerm}", found "${targetValue}"`,
      });
    }

    const sourcePlaceholders = placeholders(englishValue);
    const targetPlaceholders = placeholders(targetValue);
    const unexpected = [...targetPlaceholders].filter(
      (placeholder) => !sourcePlaceholders.has(placeholder)
    );
    const missing = [...sourcePlaceholders].filter(
      (placeholder) =>
        !OPTIONAL_PLACEHOLDERS.has(placeholder) &&
        !targetPlaceholders.has(placeholder)
    );

    if (unexpected.length || missing.length) {
      issues.push({
        locale,
        key,
        kind: "placeholder",
        message: [
          unexpected.length
            ? `unexpected: ${unexpected.join(", ")}`
            : null,
          missing.length ? `missing: ${missing.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join("; "),
      });
    }
  }

  for (const key of targetKeys) {
    if (!englishKeys.has(key) && !isLocalePluralKey(key, locale, englishKeys)) {
      issues.push({
        locale,
        key,
        kind: "extra-key",
        message: "obsolete key is not present in the English source",
      });
    }
  }

  for (const key of englishKeys) {
    if (!key.endsWith("_other")) {
      continue;
    }

    const base = key.slice(0, -"_other".length);
    if (!englishKeys.has(`${base}_one`)) {
      continue;
    }

    for (const category of pluralCategories(locale)) {
      const pluralKey = `${base}_${category}`;
      if (!targetKeys.has(pluralKey)) {
        issues.push({
          locale,
          key: pluralKey,
          kind: "missing-key",
          message: `CLDR plural form "${category}" is missing`,
        });
      }
    }
  }

  for (const [key, translations] of Object.entries(
    REQUIRED_KEY_TRANSLATIONS
  )) {
    const expected = translations[locale];
    if (target[key]?.normalize("NFC") !== expected.normalize("NFC")) {
      issues.push({
        locale,
        key,
        kind: "untranslated",
        message: `expected "${expected}", found "${target[key] ?? "<missing>"}"`,
      });
    }
  }

  for (const [key, englishValue] of Object.entries(english)) {
    if (
      locale === "zh-TW" &&
      /\baccounts?\b/iu.test(englishValue) &&
      target[key]?.includes("帳戶")
    ) {
      issues.push({
        locale,
        key,
        kind: "terminology",
        message: 'use Apple Traditional Chinese "帳號" instead of "帳戶"',
      });
    }
  }

  return issues;
}

export async function auditTranslations(): Promise<TranslationAuditIssue[]> {
  const englishObject = JSON.parse(
    await readFile(ENGLISH_FILE, "utf8")
  ) as TranslationObject;
  const english = flattenTranslations(englishObject);
  const issues: TranslationAuditIssue[] = [];

  for (const locale of TRANSLATION_LOCALES) {
    const targetObject = JSON.parse(
      await readFile(join(LOCALES_DIR, locale, "translation.json"), "utf8")
    ) as TranslationObject;
    issues.push(
      ...auditLocale(locale, english, flattenTranslations(targetObject))
    );
  }

  return issues;
}

async function fixTranslations(): Promise<void> {
  const englishObject = JSON.parse(
    await readFile(ENGLISH_FILE, "utf8")
  ) as TranslationObject;
  const english = flattenTranslations(englishObject);
  const englishKeys = new Set(Object.keys(english));

  for (const locale of TRANSLATION_LOCALES) {
    const targetFile = join(LOCALES_DIR, locale, "translation.json");
    const targetObject = JSON.parse(
      await readFile(targetFile, "utf8")
    ) as TranslationObject;

    removeExtraKeys(englishObject, targetObject, locale, englishKeys);

    for (const [key, englishValue] of Object.entries(english)) {
      const expectedTerm = getExpectedAppleUiTerm(englishValue, locale, key);
      if (expectedTerm) {
        setNestedValue(targetObject, key, expectedTerm);
      }
    }

    for (const [key, translations] of Object.entries(
      REQUIRED_KEY_TRANSLATIONS
    )) {
      setNestedValue(targetObject, key, translations[locale]);
    }

    ensureLocalePluralForms(locale, english, targetObject);

    if (locale === "zh-TW") {
      const target = flattenTranslations(targetObject);
      for (const [key, englishValue] of Object.entries(english)) {
        if (/\baccounts?\b/iu.test(englishValue) && target[key]?.includes("帳戶")) {
          setNestedValue(targetObject, key, target[key].replaceAll("帳戶", "帳號"));
        }
      }
    }

    await writeFile(
      targetFile,
      `${JSON.stringify(targetObject, null, 2)}\n`,
      "utf8"
    );
  }
}

if (import.meta.main) {
  const shouldFix = process.argv.includes("--fix");
  if (shouldFix) {
    await fixTranslations();
  }

  const issues = await auditTranslations();
  if (issues.length) {
    for (const issue of issues) {
      console.error(
        `${issue.locale} ${issue.kind} ${issue.key}: ${issue.message}`
      );
    }
    console.error(`\nTranslation audit found ${issues.length} issue(s).`);
    process.exitCode = 1;
  } else {
    console.log(
      `Translation audit passed for ${TRANSLATION_LOCALES.length} locales ` +
        `against ${Object.keys(APPLE_UI_TERMINOLOGY).length} Apple terms.`
    );
  }
}
