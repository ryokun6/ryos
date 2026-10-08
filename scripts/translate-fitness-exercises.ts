/**
 * Build src/apps/fitness/locales/{lang}.json from the pinned free-exercise-db
 * commit, then machine-translate names and instructions.
 *
 *   bun run scripts/translate-fitness-exercises.ts --english-only
 *   bun run scripts/translate-fitness-exercises.ts --lang=ja
 *   bun run scripts/translate-fitness-exercises.ts
 *
 * Requires GOOGLE_GENERATIVE_AI_API_KEY. Safe to re-run: completed exercises
 * (matching instruction counts) are skipped.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  FREE_EXERCISE_DB_COMMIT,
  FREE_EXERCISE_DB_REPO,
  normalizeExerciseRecord,
} from "../src/shared/fitness";
import {
  catalogPath,
  containsSimplifiedChinese,
  preferTraditionalChinese,
  type ExerciseCatalog,
  type ExerciseCopy,
} from "../src/apps/fitness/utils/exerciseCatalogAudit";

const LOCALES = ["zh-TW", "zh-CN", "ja", "ko", "fr", "de", "es", "pt", "it", "ru"] as const;
type Locale = (typeof LOCALES)[number];

const LANGUAGE_NAMES: Record<Locale, string> = {
  "zh-TW": "Traditional Chinese (Taiwan)",
  "zh-CN": "Simplified Chinese",
  ja: "Japanese",
  ko: "Korean",
  fr: "French",
  de: "German",
  es: "Spanish",
  pt: "Brazilian Portuguese",
  it: "Italian",
  ru: "Russian",
};

const GLOSSARY: Record<Locale, string> = {
  "zh-TW":
    "Bench Press=臥推, Squat=深蹲, Deadlift=硬舉, Barbell=槓鈴, Dumbbell=啞鈴, Kettlebell=壺鈴, Pull-up=引體向上, Push-up=伏地挺身, Plank=棒式, Lunge=弓步, Sit-up=仰臥起坐, Row=划船, Curl=彎舉, Cable=鋼索, Dip=雙槓臂屈伸",
  "zh-CN":
    "Bench Press=卧推, Squat=深蹲, Deadlift=硬拉, Barbell=杠铃, Dumbbell=哑铃, Kettlebell=壶铃, Pull-up=引体向上, Push-up=俯卧撑, Plank=平板支撑, Lunge=弓步, Sit-up=仰卧起坐, Row=划船, Curl=弯举, Cable=绳索, Dip=双杠臂屈伸",
  ja: "Bench Press=ベンチプレス, Squat=スクワット, Deadlift=デッドリフト, Barbell=バーベル, Dumbbell=ダンベル, Kettlebell=ケトルベル, Pull-up=プルアップ, Push-up=プッシュアップ, Plank=プランク, Lunge=ランジ, Sit-up=シットアップ, Cable=ケーブル",
  ko: "Bench Press=벤치 프레스, Squat=스쿼트, Deadlift=데드리프트, Barbell=바벨, Dumbbell=덤벨, Pull-up=풀업, Push-up=푸시업, Plank=플랭크, Lunge=런지, Sit-up=싯업",
  fr: "Bench Press=développé couché, Squat=squat, Deadlift=soulevé de terre, Barbell=barre, Dumbbell=haltère, Pull-up=traction, Push-up=pompe, Plank=planche, Lunge=fente, Sit-up=redressement assis",
  de: "Bench Press=Bankdrücken, Squat=Kniebeuge, Deadlift=Kreuzheben, Barbell=Langhantel, Dumbbell=Kurzhantel, Pull-up=Klimmzug, Push-up=Liegestütz, Plank=Unterarmstütz, Lunge=Ausfallschritt, Sit-up=Sit-up",
  es: "Bench Press=press de banca, Squat=sentadilla, Deadlift=peso muerto, Barbell=barra, Dumbbell=mancuerna, Pull-up=dominada, Push-up=flexión, Plank=plancha, Lunge=zancada, Sit-up=abdominal",
  pt: "Bench Press=supino, Squat=agachamento, Deadlift=levantamento terra, Barbell=barra, Dumbbell=haltere, Pull-up=barra fixa, Push-up=flexão, Plank=prancha, Lunge=afundo, Sit-up=abdominal",
  it: "Bench Press=panca piana, Squat=squat, Deadlift=stacco da terra, Barbell=bilanciere, Dumbbell=manubrio, Pull-up=trazione, Push-up=piegamento, Plank=plank, Lunge=affondo, Sit-up=sit-up",
  ru: "Bench Press=жим лёжа, Squat=присед, Deadlift=становая тяга, Barbell=штанга, Dumbbell=гантель, Pull-up=подтягивание, Push-up=отжимание, Plank=планка, Lunge=выпад, Sit-up=скручивание",
};

const TranslationSchema = z.object({
  exercises: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      instructions: z.array(z.string()),
    })
  ),
});

interface SourceExercise {
  id: string;
  name: string;
  instructions: string[];
}

function parseArgs(argv: string[]) {
  const englishOnly = argv.includes("--english-only");
  const langEq = argv.find((arg) => arg.startsWith("--lang="));
  const langFlag = argv.indexOf("--lang");
  const lang = langEq?.split("=")[1] ?? (langFlag >= 0 ? argv[langFlag + 1] : undefined);
  const concurrencyEq = argv.find((arg) => arg.startsWith("--concurrency="));
  const concurrency = concurrencyEq ? Number(concurrencyEq.split("=")[1]) : 8;
  const maxEq = argv.find((arg) => arg.startsWith("--max="));
  const max = maxEq ? Number(maxEq.split("=")[1]) : Infinity;
  return {
    englishOnly,
    lang,
    concurrency: Number.isFinite(concurrency) ? concurrency : 8,
    max: Number.isFinite(max) ? max : Infinity,
  };
}

async function loadSource(): Promise<SourceExercise[]> {
  const url = `https://cdn.jsdelivr.net/gh/${FREE_EXERCISE_DB_REPO}@${FREE_EXERCISE_DB_COMMIT}/dist/exercises.json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching exercises`);
  const raw = (await response.json()) as unknown[];
  const exercises: SourceExercise[] = [];
  for (const record of raw) {
    const exercise = normalizeExerciseRecord(record);
    if (!exercise) continue;
    exercises.push({
      id: exercise.id,
      name: exercise.name,
      instructions: exercise.instructions,
    });
  }
  exercises.sort((a, b) => a.id.localeCompare(b.id));
  return exercises;
}

function toCatalog(exercises: readonly SourceExercise[]): ExerciseCatalog {
  const catalog: ExerciseCatalog = {};
  for (const exercise of exercises) {
    catalog[exercise.id] = { name: exercise.name, instructions: exercise.instructions };
  }
  return catalog;
}

async function writeCatalog(locale: string, catalog: ExerciseCatalog): Promise<void> {
  const path = catalogPath(locale);
  await mkdir(dirname(path), { recursive: true });
  const sorted: ExerciseCatalog = {};
  for (const id of Object.keys(catalog).sort((a, b) => a.localeCompare(b))) {
    sorted[id] = catalog[id];
  }
  const file = catalogPath(locale);
  const tmp = `${file}.tmp`;
  await writeFile(tmp, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
  await rename(tmp, file);
}

async function readPartial(locale: string): Promise<ExerciseCatalog> {
  try {
    return JSON.parse(await readFile(catalogPath(locale), "utf8")) as ExerciseCatalog;
  } catch {
    return {};
  }
}

function isDone(locale: string, source: SourceExercise, copy: ExerciseCopy | undefined): boolean {
  if (!copy?.name?.trim()) return false;
  if (copy.instructions.length !== source.instructions.length) return false;
  if (copy.instructions.some((step) => !step.trim() || step.startsWith("[TODO]"))) return false;
  if (
    source.instructions.length > 0 &&
    copy.name === source.name &&
    copy.instructions.every((step, index) => step === source.instructions[index])
  ) {
    return false;
  }
  if (source.instructions.length === 0 && copy.name === source.name) return false;
  if (
    locale === "zh-TW" &&
    containsSimplifiedChinese(`${copy.name}\n${copy.instructions.join("\n")}`)
  ) {
    return false;
  }
  return true;
}

function charsOf(exercise: SourceExercise): number {
  return exercise.name.length + exercise.instructions.reduce((sum, step) => sum + step.length, 0);
}

function batchBySize(exercises: readonly SourceExercise[], maxChars: number): SourceExercise[][] {
  const batches: SourceExercise[][] = [];
  let current: SourceExercise[] = [];
  let size = 0;
  for (const exercise of exercises) {
    const weight = charsOf(exercise);
    if (current.length && size + weight > maxChars) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(exercise);
    size += weight;
  }
  if (current.length) batches.push(current);
  return batches;
}

function createLimiter(max: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return async function limit<T>(task: () => Promise<T>): Promise<T> {
    if (active >= max) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      const next = queue.shift();
      if (next) next();
    }
  };
}

function alignTranslation(
  batch: readonly SourceExercise[],
  output: Array<{ id: string; name: string; instructions: string[] }>
): ExerciseCopy[] {
  const byId = new Map(output.map((item) => [item.id, item]));
  const ordered = batch.every((item) => byId.has(item.id))
    ? batch.map((item) => byId.get(item.id)!)
    : output.length === batch.length
      ? output
      : null;
  if (!ordered) throw new Error("translation ids did not match the batch");
  return ordered.map((item, index) => {
    const source = batch[index];
    const name = item.name.trim();
    let instructions = item.instructions.map((step) => step.trim()).filter(Boolean);
    if (!name) throw new Error(`empty name for ${source.id}`);
    if (instructions.length !== source.instructions.length && source.instructions.length === 1 && instructions.length > 1) {
      instructions = [instructions.join(" ")];
    }
    if (instructions.length !== source.instructions.length) {
      throw new Error(
        `${source.id} expected ${source.instructions.length} steps, got ${instructions.length}`
      );
    }
    if (instructions.some((step) => !step)) throw new Error(`blank step for ${source.id}`);
    return { name, instructions };
  });
}

async function translateBatch(locale: Locale, batch: readonly SourceExercise[]): Promise<ExerciseCopy[]> {
  const traditional =
    locale === "zh-TW"
      ? "Write Traditional Chinese as used in Taiwan. Do not use any Simplified Chinese characters."
      : locale === "zh-CN"
        ? "Write Simplified Chinese as used in Mainland China."
        : "";
  const { output } = await generateText({
    model: google("gemini-2.5-flash"),
    temperature: 0.2,
    abortSignal: AbortSignal.timeout(150_000),
    output: Output.object({ schema: TranslationSchema, name: "exercise_translations" }),
    instructions: `You translate a fitness app's exercise library into ${LANGUAGE_NAMES[locale]}.
Tone: terse, clear, imperative, like a workout card. Do not add coaching fluff.
Keep each instruction as its own step, in the same order, with the same count.
Preserve numbers, fractions, percentages, and parenthetical cues.
Use standard gym terminology. Preferred terms: ${GLOSSARY[locale]}.
${traditional}
Return only the exercises you were given.`,
    prompt: JSON.stringify(
      batch.map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        instructions: exercise.instructions,
      }))
    ),
  });
  if (!output) throw new Error("empty translation");
  const aligned = alignTranslation(batch, output.exercises).map((copy) =>
    locale === "zh-TW"
      ? {
          name: preferTraditionalChinese(copy.name),
          instructions: copy.instructions.map((step) => preferTraditionalChinese(step)),
        }
      : copy
  );
  if (locale === "zh-TW") {
    const text = aligned.map((copy) => `${copy.name}\n${copy.instructions.join("\n")}`).join("\n");
    if (containsSimplifiedChinese(text)) {
      throw new Error("translation used Simplified Chinese");
    }
  }
  return aligned;
}

async function translateBatchReliable(
  locale: Locale,
  batch: readonly SourceExercise[]
): Promise<Array<ExerciseCopy | null>> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await translateBatch(locale, batch);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `   ${locale} attempt ${attempt} failed (${batch.map((item) => item.id).join(", ")}): ${message}`
      );
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt * attempt));
    }
  }
  if (batch.length === 1) {
    console.error(`   ${locale} giving up on ${batch[0].id}`, lastError);
    return [null];
  }
  const mid = Math.ceil(batch.length / 2);
  const left = await translateBatchReliable(locale, batch.slice(0, mid));
  const right = await translateBatchReliable(locale, batch.slice(mid));
  return [...left, ...right];
}

async function translateLocale(
  locale: Locale,
  source: readonly SourceExercise[],
  limit: <T>(task: () => Promise<T>) => Promise<T>,
  max: number
): Promise<void> {
  const existing = await readPartial(locale);
  const incomplete = source.filter((exercise) => !isDone(locale, exercise, existing[exercise.id]));
  const pending = incomplete.slice(0, max);
  console.log(`${locale}: ${source.length - incomplete.length} done, ${incomplete.length} remaining`);
  if (!pending.length) return;

  const batches = batchBySize(pending, 3200);
  let finished = source.length - incomplete.length;
  for (let index = 0; index < batches.length; index++) {
    const batch = batches[index];
    const translated = await limit(() => translateBatchReliable(locale, batch));
    batch.forEach((exercise, exerciseIndex) => {
      const copy = translated[exerciseIndex];
      if (copy) existing[exercise.id] = copy;
    });
    await writeCatalog(locale, existing);
    finished += batch.length;
    console.log(`${locale}: ${finished}/${source.length} (batch ${index + 1}/${batches.length})`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.englishOnly && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
    process.exit(1);
  }
  const source = await loadSource();
  console.log(`source exercises: ${source.length}`);
  await writeCatalog("en", toCatalog(source));
  if (args.englishOnly) return;

  const locales = args.lang ? LOCALES.filter((locale) => locale === args.lang) : [...LOCALES];
  if (!locales.length) {
    console.error(`Unknown locale ${args.lang}`);
    process.exit(1);
  }
  if (locales.length === 1) {
    const limit = createLimiter(args.concurrency);
    await translateLocale(locales[0], source, limit, args.max);
  } else {
    await translateAllLocales(locales, source, args.concurrency, args.max);
  }
  console.log("done");
}

const MultiSchema = z.object({
  exercises: z.array(
    z.object({
      id: z.string(),
      translations: z.record(
        z.string(),
        z.object({
          name: z.string(),
          instructions: z.array(z.string()),
        })
      ),
    })
  ),
});

function looksLocalized(locale: Locale, copy: ExerciseCopy): boolean {
  const text = `${copy.name}\n${copy.instructions.join("\n")}`;
  if (locale === "ja") return /[\u3040-\u30ff\u4e00-\u9fff]/u.test(text);
  if (locale === "ko") return /[\uac00-\ud7af]/u.test(text);
  if (locale === "zh-TW" || locale === "zh-CN") return /[\u4e00-\u9fff]/u.test(text);
  if (locale === "ru") return /[\u0400-\u04ff]/u.test(text);
  return true;
}

async function translateMulti(
  locales: readonly Locale[],
  batch: readonly SourceExercise[]
): Promise<Record<string, ExerciseCopy[]>> {
  const glossary = locales.map((locale) => `${locale}: ${GLOSSARY[locale]}`).join("\n");
  const { output } = await generateText({
    model: google("gemini-2.5-flash"),
    temperature: 0.2,
    abortSignal: AbortSignal.timeout(120_000),
    output: Output.object({ schema: MultiSchema, name: "exercise_translations" }),
    instructions: `You translate a fitness app's exercise library. For each exercise, return translations for every requested locale.
Tone: terse, clear, imperative, like a workout card. Do not add coaching fluff.
Keep each instruction as its own step, in the same order, with the same count.
Preserve numbers, fractions, percentages, and parenthetical cues.
zh-TW must be Traditional Chinese as used in Taiwan, with no Simplified characters.
zh-CN must be Simplified Chinese.
Preferred gym terms:
${glossary}`,
    prompt: JSON.stringify({
      locales,
      exercises: batch.map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        instructions: exercise.instructions,
      })),
    }),
  });
  if (!output) throw new Error("empty translation");
  const byId = new Map(output.exercises.map((item) => [item.id, item.translations]));
  const result: Record<string, ExerciseCopy[]> = {};
  for (const locale of locales) {
    result[locale] = batch.map((exercise) => {
      const raw = byId.get(exercise.id)?.[locale];
      if (!raw) throw new Error(`missing ${locale} for ${exercise.id}`);
      const aligned = alignTranslation([exercise], [
        { id: exercise.id, name: raw.name, instructions: raw.instructions },
      ])[0];
      const copy =
        locale === "zh-TW"
          ? {
              name: preferTraditionalChinese(aligned.name),
              instructions: aligned.instructions.map((step) => preferTraditionalChinese(step)),
            }
          : aligned;
      if (locale === "zh-TW" && containsSimplifiedChinese(`${copy.name}\n${copy.instructions.join("\n")}`)) {
        throw new Error(`simplified characters in ${exercise.id}`);
      }
      if (!looksLocalized(locale, copy)) throw new Error(`${locale} not localized for ${exercise.id}`);
      return copy;
    });
  }
  return result;
}

async function translateMultiReliable(
  locales: readonly Locale[],
  batch: readonly SourceExercise[]
): Promise<Record<string, Array<ExerciseCopy | null>>> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await translateMulti(locales, batch);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `   multi attempt ${attempt} failed (${batch.map((item) => item.id).join(", ")}): ${message}`
      );
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt * attempt));
    }
  }
  if (batch.length === 1) {
    const empty: Record<string, Array<ExerciseCopy | null>> = {};
    for (const locale of locales) empty[locale] = [null];
    return empty;
  }
  const mid = Math.ceil(batch.length / 2);
  const left = await translateMultiReliable(locales, batch.slice(0, mid));
  const right = await translateMultiReliable(locales, batch.slice(mid));
  const merged: Record<string, Array<ExerciseCopy | null>> = {};
  for (const locale of locales) merged[locale] = [...left[locale], ...right[locale]];
  return merged;
}

function createWriteLock() {
  let chain = Promise.resolve();
  return function enqueue(task: () => Promise<void>): Promise<void> {
    const run = chain.then(task, task);
    chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
}

async function translateAllLocales(
  locales: readonly Locale[],
  source: readonly SourceExercise[],
  concurrency: number,
  max: number
): Promise<void> {
  const catalogs: Record<string, ExerciseCatalog> = {};
  for (const locale of locales) catalogs[locale] = await readPartial(locale);
  const incomplete = source.filter((exercise) =>
    locales.some((locale) => !isDone(locale, exercise, catalogs[locale][exercise.id]))
  );
  const pending = incomplete.slice(0, max);
  console.log(`multi: ${source.length - incomplete.length} done, ${incomplete.length} remaining`);
  if (!pending.length) return;

  const batches: SourceExercise[][] = [];
  for (let index = 0; index < pending.length; index += 2) {
    batches.push(pending.slice(index, index + 2));
  }
  const limit = createLimiter(concurrency);
  const write = createWriteLock();
  let finished = source.length - incomplete.length;
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrency, batches.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < batches.length) {
        const index = cursor;
        cursor += 1;
        const batch = batches[index];
        const translated = await limit(() => translateMultiReliable(locales, batch));
        await write(async () => {
          for (const locale of locales) {
            batch.forEach((exercise, exerciseIndex) => {
              const copy = translated[locale][exerciseIndex];
              if (copy) catalogs[locale][exercise.id] = copy;
            });
            await writeCatalog(locale, catalogs[locale]);
          }
          finished += batch.length;
          console.log(`multi: ${finished}/${source.length} (batch ${index + 1}/${batches.length})`);
        });
      }
    })
  );
}

if (import.meta.main) {
  await main();
}
