#!/usr/bin/env bun

/**
 * Script to sync English translation keys to other language files
 * 
 * This script:
 * - Reads the English translation.json as the source of truth
 * - For each other language file, adds missing keys from English
 * - Preserves existing translations (doesn't overwrite)
 * - Adds missing keys with English text as placeholder (marked with [TODO])
 * 
 * Usage:
 *   bun run scripts/sync-translations.ts
 *   bun run scripts/sync-translations.ts --dry-run  (preview changes without writing)
 *   bun run scripts/sync-translations.ts --mark-untranslated  (mark untranslated keys)
 */

import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const LOCALES_DIR = join(process.cwd(), "src/lib/locales");
const ENGLISH_FILE = join(LOCALES_DIR, "en/translation.json");
const OTHER_LANGUAGES = ["zh-TW", "ja", "ko", "fr", "de", "es", "pt", "it", "ru"];

interface TranslationObject {
  [key: string]: string | TranslationObject;
}

/**
 * Deep merge: adds missing keys from source to target, preserving existing values
 */
function deepMergeKeys(
  source: TranslationObject,
  target: TranslationObject,
  markUntranslated: boolean = false
): TranslationObject {
  const result: TranslationObject = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (typeof sourceValue === "object" && sourceValue !== null) {
      // Recursively merge nested objects
      if (typeof targetValue === "object" && targetValue !== null) {
        result[key] = deepMergeKeys(
          sourceValue as TranslationObject,
          targetValue as TranslationObject,
          markUntranslated
        );
      } else {
        // Target doesn't have this nested object, copy from source
        result[key] = markUntranslated
          ? markObjectAsUntranslated(sourceValue as TranslationObject)
          : { ...sourceValue };
      }
    } else {
      // Leaf value - only add if missing
      if (!(key in target)) {
        result[key] = markUntranslated
          ? `[TODO] ${sourceValue as string}`
          : (sourceValue as string);
      } else {
        // Preserve existing translation
        result[key] = targetValue;
      }
    }
  }

  return result;
}

/**
 * Mark all values in an object as untranslated
 */
function markObjectAsUntranslated(obj: TranslationObject): TranslationObject {
  const result: TranslationObject = {};
  for (const key in obj) {
    const value = obj[key];
    if (typeof value === "object" && value !== null) {
      result[key] = markObjectAsUntranslated(value);
    } else {
      result[key] = `[TODO] ${value as string}`;
    }
  }
  return result;
}

/**
 * Count missing keys (keys in source but not in target)
 */
function countMissingKeys(
  source: TranslationObject,
  target: TranslationObject
): number {
  let count = 0;

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (typeof sourceValue === "object" && sourceValue !== null) {
      if (typeof targetValue === "object" && targetValue !== null) {
        count += countMissingKeys(
          sourceValue as TranslationObject,
          targetValue as TranslationObject
        );
      } else {
        // Entire nested object is missing
        count += countAllKeys(sourceValue as TranslationObject);
      }
    } else {
      if (!(key in target)) {
        count++;
      }
    }
  }

  return count;
}

/**
 * Count all keys in an object (including nested)
 */
function countAllKeys(obj: TranslationObject): number {
  let count = 0;
  for (const key in obj) {
    const value = obj[key];
    if (typeof value === "object" && value !== null) {
      count += countAllKeys(value);
    } else {
      count++;
    }
  }
  return count;
}

/**
 * Sort object keys recursively for consistent output
 */
function sortKeys(obj: TranslationObject): TranslationObject {
  const sorted: TranslationObject = {};
  const keys = Object.keys(obj).sort();

  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      sorted[key] = sortKeys(value as TranslationObject);
    } else {
      sorted[key] = value;
    }
  }

  return sorted;
}

async function syncTranslations(
  dryRun: boolean = false,
  markUntranslated: boolean = false
) {
  console.log("🔄 Syncing translation keys from English to other languages...\n");

  // Read English translation file (source of truth)
  const englishContent = await readFile(ENGLISH_FILE, "utf-8");
  const englishTranslations: TranslationObject = JSON.parse(englishContent);

  console.log(`📖 Source: ${ENGLISH_FILE}`);
  console.log(`📊 Total keys in English: ${countAllKeys(englishTranslations)}\n`);

  const results: Array<{
    lang: string;
    file: string;
    missing: number;
    updated: boolean;
  }> = [];

  // Process each language
  for (const lang of OTHER_LANGUAGES) {
    const langFile = join(LOCALES_DIR, `${lang}/translation.json`);

    try {
      // Read existing translation file
      const langContent = await readFile(langFile, "utf-8");
      const langTranslations: TranslationObject = JSON.parse(langContent);

      // Count missing keys before merge
      const missingBefore = countMissingKeys(englishTranslations, langTranslations);

      if (missingBefore === 0) {
        console.log(`✅ ${lang}: Already up to date (no missing keys)`);
        results.push({ lang, file: langFile, missing: 0, updated: false });
        continue;
      }

      // Merge missing keys
      const merged = deepMergeKeys(
        englishTranslations,
        langTranslations,
        markUntranslated
      );

      // Sort keys for consistent output
      const sorted = sortKeys(merged);

      // Write updated file
      if (!dryRun) {
        const formatted = JSON.stringify(sorted, null, 2) + "\n";
        await writeFile(langFile, formatted, "utf-8");
        console.log(`✅ ${lang}: Added ${missingBefore} missing key(s)`);
        results.push({ lang, file: langFile, missing: missingBefore, updated: true });
      } else {
        console.log(`🔍 ${lang}: Would add ${missingBefore} missing key(s) (dry-run)`);
        results.push({ lang, file: langFile, missing: missingBefore, updated: false });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        console.log(`⚠️  ${lang}: File not found, skipping`);
      } else {
        console.error(`❌ ${lang}: Error - ${(error as Error).message}`);
      }
      results.push({ lang, file: langFile, missing: 0, updated: false });
    }
  }

  // Summary
  console.log("\n" + "═".repeat(60));
  console.log("                         SUMMARY");
  console.log("═".repeat(60));

  const totalMissing = results.reduce((sum, r) => sum + r.missing, 0);
  const totalUpdated = results.filter((r) => r.updated).length;

  if (dryRun) {
    console.log(`\n🔍 Dry-run mode: No files were modified`);
    console.log(`📊 Total missing keys across all languages: ${totalMissing}`);
    console.log(`\nRun without --dry-run to apply changes`);
  } else {
    console.log(`\n✅ Updated ${totalUpdated} language file(s)`);
    console.log(`📊 Total keys added: ${totalMissing}`);
  }

  // Show detailed breakdown
  console.log("\n📋 Breakdown by language:");
  for (const result of results) {
    if (result.missing > 0) {
      const status = result.updated ? "✅" : "🔍";
      console.log(`   ${status} ${result.lang}: ${result.missing} key(s)`);
    }
  }

  if (markUntranslated) {
    console.log("\n💡 Note: Untranslated keys are marked with [TODO] prefix");
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const markUntranslated = args.includes("--mark-untranslated");

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Usage: bun run scripts/sync-translations.ts [options]

Options:
  --dry-run              Preview changes without writing files
  --mark-untranslated    Mark missing keys with [TODO] prefix
  --help, -h             Show this help message

Examples:
  bun run scripts/sync-translations.ts
  bun run scripts/sync-translations.ts --dry-run
  bun run scripts/sync-translations.ts --mark-untranslated
`);
  process.exit(0);
}

syncTranslations(dryRun, markUntranslated).catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});

