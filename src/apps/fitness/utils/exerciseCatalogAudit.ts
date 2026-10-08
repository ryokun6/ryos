import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SUPPORTED_LANGUAGES } from "../../../lib/languageConfig";

export interface ExerciseCopy {
  name: string;
  instructions: string[];
}

export type ExerciseCatalog = Record<string, ExerciseCopy>;

export interface ExerciseCatalogAuditIssue {
  locale: string;
  key: string;
  kind: "extra-key" | "missing-key" | "todo" | "untranslated" | "terminology";
  message: string;
}

/**
 * Simplified characters that should not appear in Traditional Chinese fitness copy.
 * Shared by the catalog audit and the translator's zh-TW check.
 */
export const SIMPLIFIED_ONLY_CHARS = "国体这练动卧举哑铃单双压弯头脚颈后发对时间钟节组个为从将并与于着门问电长车东马鱼鸟页风飞饭饮馆课书读说语话认识让议记许论请谢负财货质费赛轻较转轮软铁钢铜银钱键锁关闭开习杆杠髋宽紧续过还进远边际处备护垫绳带盘负复种云";

/** Common simplified forms mapped to Traditional Chinese for fitness copy. */
const SIMPLIFIED_TO_TRADITIONAL: Record<string, string> = {
  国: "國", 体: "體", 这: "這", 练: "練", 动: "動", 卧: "臥", 举: "舉", 哑: "啞", 铃: "鈴",
  单: "單", 双: "雙", 压: "壓", 弯: "彎", 头: "頭", 脚: "腳", 颈: "頸", 后: "後", 发: "發",
  对: "對", 时: "時", 间: "間", 钟: "鐘", 节: "節", 组: "組", 个: "個", 为: "為", 从: "從",
  将: "將", 并: "並", 与: "與", 于: "於", 着: "著", 门: "門", 问: "問", 电: "電", 长: "長",
  车: "車", 东: "東", 马: "馬", 鱼: "魚", 鸟: "鳥", 页: "頁", 风: "風", 飞: "飛", 饭: "飯",
  饮: "飲", 馆: "館", 课: "課", 书: "書", 读: "讀", 说: "說", 语: "語", 话: "話", 认: "認",
  识: "識", 让: "讓", 议: "議", 记: "記", 许: "許", 论: "論", 请: "請", 谢: "謝", 负: "負",
  财: "財", 货: "貨", 质: "質", 费: "費", 赛: "賽", 轻: "輕", 较: "較", 转: "轉", 轮: "輪",
  软: "軟", 铁: "鐵", 钢: "鋼", 铜: "銅", 银: "銀", 钱: "錢", 键: "鍵", 锁: "鎖", 关: "關",
  闭: "閉", 开: "開", 习: "習", 杆: "桿", 杠: "槓", 髋: "髖", 宽: "寬", 紧: "緊", 续: "續",
  过: "過", 还: "還", 进: "進", 远: "遠", 边: "邊", 际: "際", 处: "處", 备: "備", 护: "護",
  垫: "墊", 绳: "繩", 带: "帶", 盘: "盤", 复: "複", 种: "種", 云: "雲",
};

export function preferTraditionalChinese(text: string): string {
  return [...text].map((char) => SIMPLIFIED_TO_TRADITIONAL[char] ?? char).join("");
}

const CATALOG_DIR = join(process.cwd(), "src/apps/fitness/locales");
const LOCALES = SUPPORTED_LANGUAGES.filter((locale) => locale !== "en");

export function catalogPath(locale: string): string {
  return join(CATALOG_DIR, `${locale}.json`);
}

export function readExerciseCatalog(locale: string): ExerciseCatalog {
  return JSON.parse(readFileSync(catalogPath(locale), "utf8")) as ExerciseCatalog;
}

export function containsSimplifiedChinese(text: string): boolean {
  return [...text].some((char) => SIMPLIFIED_ONLY_CHARS.includes(char));
}

function isCopy(value: unknown): value is ExerciseCopy {
  if (!value || typeof value !== "object") return false;
  const copy = value as ExerciseCopy;
  return typeof copy.name === "string" && Array.isArray(copy.instructions);
}

function sameSteps(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

/** Structural audit of the fitness exercise catalogs against English. */
export function auditFitnessExerciseCatalogs(): ExerciseCatalogAuditIssue[] {
  let english: ExerciseCatalog;
  try {
    english = readExerciseCatalog("en");
  } catch {
    return [
      {
        locale: "en",
        key: "apps.fitness.exerciseCatalog",
        kind: "missing-key",
        message: "English exercise catalog is missing",
      },
    ];
  }

  const issues: ExerciseCatalogAuditIssue[] = [];
  for (const locale of LOCALES) {
    let target: ExerciseCatalog;
    try {
      target = readExerciseCatalog(locale);
    } catch {
      issues.push({
        locale,
        key: "apps.fitness.exerciseCatalog",
        kind: "missing-key",
        message: "exercise catalog file is missing",
      });
      continue;
    }

    for (const [id, source] of Object.entries(english)) {
      const key = `apps.fitness.exerciseCatalog.${id}`;
      const copy = target[id];
      if (!isCopy(copy)) {
        issues.push({
          locale,
          key,
          kind: "missing-key",
          message: "exercise is missing",
        });
        continue;
      }
      if (!copy.name.trim() || copy.name.startsWith("[TODO]")) {
        issues.push({
          locale,
          key: `${key}.name`,
          kind: copy.name.startsWith("[TODO]") ? "todo" : "untranslated",
          message: "name is empty or still marked [TODO]",
        });
      }
      if (
        !Array.isArray(copy.instructions) ||
        copy.instructions.length !== source.instructions.length ||
        copy.instructions.some((step) => typeof step !== "string" || !step.trim() || step.startsWith("[TODO]"))
      ) {
        issues.push({
          locale,
          key: `${key}.instructions`,
          kind: copy.instructions?.some((step) => typeof step === "string" && step.startsWith("[TODO]"))
            ? "todo"
            : "untranslated",
          message: `expected ${source.instructions.length} instruction steps`,
        });
      } else if (
        (source.instructions.length > 0 && sameSteps(copy.instructions, source.instructions)) ||
        (source.instructions.length === 0 && copy.name === source.name)
      ) {
        issues.push({
          locale,
          key,
          kind: "untranslated",
          message: "name and instructions are still English",
        });
      }
      if (locale === "zh-TW") {
        const text = `${copy.name}\n${copy.instructions.join("\n")}`;
        if (containsSimplifiedChinese(text)) {
          issues.push({
            locale,
            key,
            kind: "terminology",
            message: "Traditional Chinese catalog contains Simplified characters",
          });
        }
      }
    }

    for (const id of Object.keys(target)) {
      if (!(id in english)) {
        issues.push({
          locale,
          key: `apps.fitness.exerciseCatalog.${id}`,
          kind: "extra-key",
          message: "obsolete exercise is not in the English catalog",
        });
      }
    }
  }

  return issues;
}
