#!/usr/bin/env bun

/**
 * Script to machine translate [TODO] marked keys in translation files using Gemini 2.5 Flash
 * 
 * This script:
 * - Reads translation files for each language
 * - Finds keys marked with [TODO] prefix
 * - Uses Gemini 2.5 Flash to translate from English
 * - Updates the translation files with translated values
 * - Supports batch translation with rate limiting
 * 
 * Usage:
 *   bun run scripts/machine-translate.ts                    # Translate all languages
 *   bun run scripts/machine-translate.ts --lang ja         # Translate only Japanese
 *   bun run scripts/machine-translate.ts --dry-run         # Preview without translating
 *   bun run scripts/machine-translate.ts --batch-size 10   # Custom batch size
 */

import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";

const LOCALES_DIR = join(process.cwd(), "src/lib/locales");
const ENGLISH_FILE = join(LOCALES_DIR, "en/translation.json");
const OTHER_LANGUAGES = ["zh-TW", "ja", "ko", "fr", "de", "es", "pt", "it", "ru"];

// Language names for better context in prompts
const LANGUAGE_NAMES: Record<string, string> = {
  "zh-TW": "Traditional Chinese",
  "ja": "Japanese",
  "ko": "Korean",
  "fr": "French",
  "de": "German",
  "es": "Spanish",
  "pt": "Portuguese",
  "it": "Italian",
  "ru": "Russian",
};

interface TranslationObject {
  [key: string]: string | TranslationObject;
}

interface TodoKey {
  path: string[];
  value: string;
  englishValue: string;
}

/**
 * Check if API key is available
 */
function checkApiKey(): void {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.error("❌ Error: GOOGLE_GENERATIVE_AI_API_KEY environment variable is not set");
    console.error("\nPlease set it with:");
    console.error("  export GOOGLE_GENERATIVE_AI_API_KEY=your_api_key");
    console.error("\nOr add it to your .env file");
    process.exit(1);
  }
}

/**
 * Find all [TODO] marked keys in a translation object
 */
function findTodoKeys(
  obj: TranslationObject,
  englishObj: TranslationObject,
  path: string[] = []
): TodoKey[] {
  const todos: TodoKey[] = [];

  for (const key in obj) {
    const value = obj[key];
    const englishValue = englishObj[key];

    if (typeof value === "object" && value !== null) {
      if (typeof englishValue === "object" && englishValue !== null) {
        todos.push(...findTodoKeys(value, englishValue, [...path, key]));
      }
    } else if (typeof value === "string") {
      if (value.startsWith("[TODO]")) {
        const englishText = typeof englishValue === "string" ? englishValue : value.replace("[TODO] ", "");
        todos.push({
          path: [...path, key],
          value,
          englishValue: englishText,
        });
      }
    }
  }

  return todos;
}

/**
 * Update a nested object with a translated value
 */
function updateNestedValue(
  obj: TranslationObject,
  path: string[],
  newValue: string
): void {
  let current: TranslationObject = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!(key in current) || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key] as TranslationObject;
  }
  current[path[path.length - 1]] = newValue;
}

/**
 * Translate a batch of strings using Gemini 2.5 Flash
 */
async function translateBatch(
  texts: string[],
  targetLanguage: string
): Promise<string[]> {
  const languageName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;
  
  const prompt = `You are a professional translator. Translate the following English strings to ${languageName}.

Rules:
- Maintain the exact same meaning and tone
- Keep technical terms consistent (e.g., "Finder", "iPod", "Applet")
- Preserve formatting and special characters
- For UI strings, use natural, concise language appropriate for that language
- Return ONLY a JSON array of translated strings in the same order
- Do not include any explanations or additional text

English strings to translate:
${JSON.stringify(texts, null, 2)}

Return ONLY a valid JSON array of strings, nothing else.`;

  try {
    const { text } = await generateText({
      model: google("gemini-2.5-flash"),
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
    });

    // Parse the response - it should be a JSON array
    const cleaned = text.trim();
    // Remove markdown code blocks if present
    const jsonMatch = cleaned.match(/```(?:json)?\s*(\[.*\])\s*```/s) || cleaned.match(/\[.*\]/s);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : cleaned;
    
    const translated = JSON.parse(jsonStr);
    
    if (!Array.isArray(translated) || translated.length !== texts.length) {
      throw new Error(`Invalid response format: expected array of ${texts.length} strings`);
    }

    return translated;
  } catch (error) {
    console.error(`❌ Translation error:`, error);
    throw error;
  }
}

/**
 * Sort object keys recursively
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

/**
 * Translate all [TODO] keys for a language
 */
async function translateLanguage(
  lang: string,
  dryRun: boolean = false,
  batchSize: number = 20
): Promise<{ translated: number; total: number }> {
  const langFile = join(LOCALES_DIR, `${lang}/translation.json`);

  // Read English and target language files
  const englishContent = await readFile(ENGLISH_FILE, "utf-8");
  const langContent = await readFile(langFile, "utf-8");

  const englishTranslations: TranslationObject = JSON.parse(englishContent);
  const langTranslations: TranslationObject = JSON.parse(langContent);

  // Find all [TODO] keys
  const todoKeys = findTodoKeys(langTranslations, englishTranslations);

  if (todoKeys.length === 0) {
    console.log(`✅ ${lang}: No [TODO] keys found`);
    return { translated: 0, total: 0 };
  }

  console.log(`\n📝 ${lang}: Found ${todoKeys.length} [TODO] key(s) to translate`);

  if (dryRun) {
    console.log(`🔍 Dry-run mode: Would translate ${todoKeys.length} key(s)`);
    todoKeys.slice(0, 5).forEach((key) => {
      console.log(`   - ${key.path.join(".")}: "${key.englishValue}"`);
    });
    if (todoKeys.length > 5) {
      console.log(`   ... and ${todoKeys.length - 5} more`);
    }
    return { translated: 0, total: todoKeys.length };
  }

  // Translate in batches
  const updatedTranslations = { ...langTranslations };
  let translatedCount = 0;

  for (let i = 0; i < todoKeys.length; i += batchSize) {
    const batch = todoKeys.slice(i, i + batchSize);
    const batchTexts = batch.map((k) => k.englishValue);

    console.log(`   Translating batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(todoKeys.length / batchSize)} (${batch.length} strings)...`);

    try {
      const translatedTexts = await translateBatch(batchTexts, lang);

      // Update translations
      batch.forEach((key, index) => {
        updateNestedValue(updatedTranslations, key.path, translatedTexts[index]);
        translatedCount++;
      });

      // Small delay to avoid rate limiting
      if (i + batchSize < todoKeys.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`   ❌ Batch translation failed:`, error);
      console.error(`   Continuing with remaining batches...`);
    }
  }

  // Sort and write updated file
  const sorted = sortKeys(updatedTranslations);
  const formatted = JSON.stringify(sorted, null, 2) + "\n";
  await writeFile(langFile, formatted, "utf-8");

  console.log(`   ✅ Translated ${translatedCount}/${todoKeys.length} key(s)`);

  return { translated: translatedCount, total: todoKeys.length };
}

async function main() {
  // Parse arguments
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  
  // Support both --lang=ja and --lang ja formats
  let langArg: string | undefined;
  const langEqualsIndex = args.findIndex((arg) => arg.startsWith("--lang="));
  if (langEqualsIndex !== -1) {
    langArg = args[langEqualsIndex].split("=")[1];
  } else {
    const langIndex = args.findIndex((arg) => arg === "--lang");
    if (langIndex !== -1 && args[langIndex + 1]) {
      langArg = args[langIndex + 1];
    }
  }
  
  const batchSizeArg = args.find((arg) => arg.startsWith("--batch-size="))?.split("=")[1];
  const batchSize = batchSizeArg ? parseInt(batchSizeArg, 10) : 20;

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: bun run scripts/machine-translate.ts [options]

Options:
  --lang=<lang>          Translate only specific language (zh-TW, ja, ko, fr, de)
  --dry-run              Preview changes without translating
  --batch-size=<n>       Number of strings to translate per batch (default: 20)
  --help, -h             Show this help message

Examples:
  bun run scripts/machine-translate.ts
  bun run scripts/machine-translate.ts --lang ja
  bun run scripts/machine-translate.ts --dry-run
  bun run scripts/machine-translate.ts --batch-size 10

Environment:
  GOOGLE_GENERATIVE_AI_API_KEY  Required: Your Google Gemini API key
`);
    process.exit(0);
  }

  if (!dryRun) {
    checkApiKey();
  }

  console.log("🤖 Machine Translation using Gemini 2.5 Flash");
  console.log("═".repeat(60));

  let languagesToProcess: string[];
  
  if (langArg) {
    if (!OTHER_LANGUAGES.includes(langArg)) {
      console.error(`❌ Error: Invalid language "${langArg}"`);
      console.error(`Valid languages: ${OTHER_LANGUAGES.join(", ")}`);
      process.exit(1);
    }
    languagesToProcess = [langArg];
  } else {
    languagesToProcess = OTHER_LANGUAGES;
  }

  console.log(`\n📋 Processing ${languagesToProcess.length} language(s)`);
  if (dryRun) {
    console.log("🔍 Dry-run mode: No translations will be performed\n");
  }

  const results: Array<{ lang: string; translated: number; total: number }> = [];

  for (const lang of languagesToProcess) {
    try {
      const result = await translateLanguage(lang, dryRun, batchSize);
      results.push({ lang, ...result });
    } catch (error) {
      console.error(`❌ Error processing ${lang}:`, error);
      results.push({ lang, translated: 0, total: 0 });
    }
  }

  // Summary
  console.log("\n" + "═".repeat(60));
  console.log("                         SUMMARY");
  console.log("═".repeat(60));

  const totalTranslated = results.reduce((sum, r) => sum + r.translated, 0);
  const totalKeys = results.reduce((sum, r) => sum + r.total, 0);

  if (dryRun) {
    console.log(`\n🔍 Dry-run mode: No translations were performed`);
    console.log(`📊 Total [TODO] keys found: ${totalKeys}`);
  } else {
    console.log(`\n✅ Translated ${totalTranslated} key(s) across ${results.length} language(s)`);
    console.log(`📊 Total keys processed: ${totalKeys}`);
  }

  console.log("\n📋 Breakdown by language:");
  for (const result of results) {
    if (result.total > 0) {
      const status = result.translated > 0 ? "✅" : "🔍";
      const progress = dryRun
        ? `${result.total} found`
        : `${result.translated}/${result.total} translated`;
      console.log(`   ${status} ${result.lang}: ${progress}`);
    }
  }

  if (!dryRun && totalTranslated > 0) {
    console.log("\n💡 Tip: Review translations and remove [TODO] markers if needed");
    console.log("💡 Tip: Run with --dry-run to preview changes first");
  }
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});

