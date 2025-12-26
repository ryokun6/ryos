#!/usr/bin/env bun

/**
 * Script to find potentially untranslated strings in the codebase
 * Looks for hardcoded English strings that should be translated
 */

import { readdir, readFile } from "fs/promises";
import { join } from "path";

const COMMON_ENGLISH_PATTERNS = [
  /["'](File|Edit|View|Help|Save|Cancel|Close|Open|New|Delete|Copy|Paste|Cut|Undo|Redo)["']/gi,
  /["'](About|Settings|Preferences|Options|Menu|Window|Application)["']/gi,
  /title:\s*["']([A-Z][^"']+)["']/gi,
  /label:\s*["']([A-Z][^"']+)["']/gi,
  /description:\s*["']([A-Z][^"']+)["']/gi,
];

const IGNORE_PATTERNS = [
  /\.test\./,
  /\.spec\./,
  /node_modules/,
  /dist/,
  /\.lock/,
  /package\.json/,
  /LOCALIZATION/,
  /translation\.json/,
];

async function findFiles(dir: string, extensions: string[] = [".tsx", ".ts"]): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (IGNORE_PATTERNS.some((pattern) => pattern.test(fullPath))) {
        continue;
      }
      if (entry.isDirectory()) {
        files.push(...(await findFiles(fullPath, extensions)));
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  } catch {
    // Ignore permission errors
  }
  return files;
}

async function checkFile(filePath: string): Promise<Array<{ line: number; match: string }>> {
  const content = await readFile(filePath, "utf-8");
  const lines = content.split("\n");
  const issues: Array<{ line: number; match: string }> = [];

  lines.forEach((line, index) => {
    // Skip comments and imports
    if (line.trim().startsWith("//") || line.trim().startsWith("*") || line.trim().startsWith("import")) {
      return;
    }

    // Skip if already using t() function
    if (line.includes("t(") || line.includes("useTranslation")) {
      return;
    }

    COMMON_ENGLISH_PATTERNS.forEach((pattern) => {
      const matches = line.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].length > 2) {
          issues.push({
            line: index + 1,
            match: match[0],
          });
        }
      }
    });
  });

  return issues;
}

async function main() {
  const srcDir = join(process.cwd(), "src");
  const files = await findFiles(srcDir);

  console.log(`Checking ${files.length} files for untranslated strings...\n`);

  const results: Array<{ file: string; issues: Array<{ line: number; match: string }> }> = [];

  for (const file of files) {
    const issues = await checkFile(file);
    if (issues.length > 0) {
      results.push({ file, issues });
    }
  }

  if (results.length === 0) {
    console.log("✅ No obvious untranslated strings found!");
    return;
  }

  console.log(`Found ${results.length} files with potential untranslated strings:\n`);

  results.forEach(({ file, issues }) => {
    console.log(`📄 ${file.replace(process.cwd() + "/", "")}`);
    issues.slice(0, 5).forEach(({ line, match }) => {
      console.log(`   Line ${line}: ${match}`);
    });
    if (issues.length > 5) {
      console.log(`   ... and ${issues.length - 5} more`);
    }
    console.log();
  });
}

main().catch(console.error);

