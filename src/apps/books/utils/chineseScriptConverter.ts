import type { ConverterFunction } from "opencc-js/core";
import type { BooksChineseScript } from "@/stores/useBooksStore";

type ConverterTarget = Exclude<BooksChineseScript, "original">;

export interface ChineseScriptConversionSession {
  originalTextByNode: WeakMap<Text, string>;
  originalLangByDocument: WeakMap<Document, string | null>;
}

let simplifiedConverterPromise: Promise<ConverterFunction> | null = null;
let traditionalConverterPromise: Promise<ConverterFunction> | null = null;

export function createChineseScriptConversionSession(): ChineseScriptConversionSession {
  return {
    originalTextByNode: new WeakMap(),
    originalLangByDocument: new WeakMap(),
  };
}

export function resolveChineseScriptReadingLanguage(
  target: BooksChineseScript,
  fallbackLanguage: string
): string {
  if (target === "simplified") return "zh-CN";
  if (target === "traditional") return "zh-TW";
  return fallbackLanguage;
}

async function loadChineseConverter(
  target: ConverterTarget
): Promise<ConverterFunction> {
  if (target === "simplified") {
    simplifiedConverterPromise ??= import("opencc-js/t2cn").then(({ Converter }) =>
      Converter({ from: "tw", to: "cn" })
    );
    return simplifiedConverterPromise;
  }

  traditionalConverterPromise ??= import("opencc-js/cn2t").then(({ Converter }) =>
    Converter({ from: "cn", to: "tw" })
  );
  return traditionalConverterPromise;
}

const HAN_CHARACTER_REGEX = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const SKIPPED_TEXT_CONTAINERS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEXTAREA",
]);

function textNodesIn(document: Document): Text[] {
  const root = document.body ?? document.documentElement;
  if (!root) return [];

  const walker = document.createTreeWalker(root, 4);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    if (
      current.nodeType === 3 &&
      !SKIPPED_TEXT_CONTAINERS.has(current.parentElement?.tagName ?? "")
    ) {
      nodes.push(current as Text);
    }
    current = walker.nextNode();
  }
  return nodes;
}

function restoreOriginalText(
  document: Document,
  session: ChineseScriptConversionSession
): number {
  let changedNodeCount = 0;
  for (const node of textNodesIn(document)) {
    const original = session.originalTextByNode.get(node);
    if (original !== undefined && node.data !== original) {
      node.data = original;
      changedNodeCount += 1;
    }
  }

  if (session.originalLangByDocument.has(document)) {
    const originalLang = session.originalLangByDocument.get(document);
    if (originalLang === null) {
      document.documentElement?.removeAttribute("lang");
    } else if (originalLang !== undefined) {
      document.documentElement?.setAttribute("lang", originalLang);
    }
  }

  return changedNodeCount;
}

/**
 * Convert only rendered text nodes so EPUB markup, links, and attributes remain
 * untouched. Original strings are retained per node, making every selection
 * reversible without reloading the chapter.
 */
export async function applyChineseScriptToDocument(
  document: Document,
  target: BooksChineseScript,
  session: ChineseScriptConversionSession,
  isCurrent: () => boolean = () => true
): Promise<number> {
  if (target === "original") {
    return restoreOriginalText(document, session);
  }

  const convert = await loadChineseConverter(target);
  if (!isCurrent()) return 0;

  if (!session.originalLangByDocument.has(document)) {
    session.originalLangByDocument.set(
      document,
      document.documentElement?.getAttribute("lang") ?? null
    );
  }
  document.documentElement?.setAttribute(
    "lang",
    resolveChineseScriptReadingLanguage(target, "")
  );

  let changedNodeCount = 0;
  for (const node of textNodesIn(document)) {
    if (!node.isConnected) continue;
    const original = session.originalTextByNode.get(node) ?? node.data;
    if (!HAN_CHARACTER_REGEX.test(original)) continue;
    session.originalTextByNode.set(node, original);
    const converted = convert(original);
    if (node.data !== converted) {
      node.data = converted;
      changedNodeCount += 1;
    }
  }
  return changedNodeCount;
}
