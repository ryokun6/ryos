#!/usr/bin/env bun

/**
 * Script to extract hardcoded strings from TSX files and generate translation keys
 * 
 * This script scans TSX files for untranslated strings and suggests translation keys.
 * 
 * Usage:
 *   bun run scripts/extract-strings.ts                    # Scan all TSX files
 *   bun run scripts/extract-strings.ts --dir src/apps     # Scan specific directory
 *   bun run scripts/extract-strings.ts --pattern MenuBar  # Scan files matching pattern
 *   bun run scripts/extract-strings.ts --exclude test     # Exclude directories
 */

import { readdir, readFile } from "fs/promises";
import { join, relative } from "path";

interface ExtractedString {
  file: string;
  line: number;
  original: string;
  suggestedKey: string;
  context: string;
}

interface FileAnalysis {
  file: string;
  componentType: string;
  appId?: string;
  hasTranslation: boolean;
  strings: ExtractedString[];
}

// Common strings that should use common.* keys
const COMMON_STRINGS: Record<string, string> = {
  // Menu items
  "File": "common.menu.file",
  "Edit": "common.menu.edit",
  "View": "common.menu.view",
  "Go": "common.menu.go",
  "Help": "common.menu.help",
  "Close": "common.menu.close",
  "Undo": "common.menu.undo",
  "Redo": "common.menu.redo",
  "Cut": "common.menu.cut",
  "Copy": "common.menu.copy",
  "Paste": "common.menu.paste",
  "Clear": "common.menu.clear",
  "Select All": "common.menu.selectAll",
  "Share App...": "common.menu.shareApp",
  "Applications": "common.menu.applications",
  "Documents": "common.menu.documents",
  "Images": "common.menu.images",
  "Music": "common.menu.music",
  "Sites": "common.menu.sites",
  "Videos": "common.menu.videos",
  "Trash": "common.menu.trash",
  // Dialog strings
  "Save": "common.dialog.save",
  "Cancel": "common.dialog.cancel",
  "Confirm": "common.dialog.confirm",
  "Delete": "common.dialog.delete",
  "About": "common.dialog.about",
};

// Patterns to find hardcoded strings in JSX/TSX
const STRING_PATTERNS = [
  // Button/Label text: >Text< or >Text</Button>
  />\s*([A-Z][a-zA-Z0-9\s&.,!?\-:;()…]+)\s*<\/[A-Z]/g,
  // String literals in JSX: "Text" or 'Text' (but not in t() calls)
  /(?<!t\(["'])(["'])([A-Z][a-zA-Z0-9\s&.,!?\-:;()…]{2,})\1(?!["']\))/g,
  // Template literals: `Text` (but not in t() calls)
  /(?<!t\()`([A-Z][a-zA-Z0-9\s&.,!?\-:;()…]{2,})`(?!\))/g,
  // Text content in elements: >Text< (but not in JSX expressions)
  />\s*([A-Z][a-zA-Z0-9\s&.,!?\-:;()…]{2,})\s*</g,
  // Menu items and labels: "Text" or 'Text' in JSX attributes or content
  /(?:label|title|text|children|content)\s*[:=]\s*["']([A-Z][a-zA-Z0-9\s&.,!?\-:;()…]{2,})["']/gi,
];

// Ignore patterns (don't extract these)
const IGNORE_PATTERNS = [
  /^[A-Z][a-z]+[A-Z]/,  // PascalCase (likely component names)
  /^[a-z]+$/,           // lowercase (likely variables/props)
  /^\d+$/,              // Numbers
  /^[A-Z]$/,            // Single capital letter
  /^(id|key|name|type|className|href|src|alt|title|aria-)/i,  // HTML attributes
  /^(use|get|set|is|has|on|handle)/i,  // Function names
  /^(true|false|null|undefined)$/i,    // Literals
  /^[A-Z_]+$/,          // Constants (ALL_CAPS)
  /^[a-z]+\.[a-z]+/i,   // Object properties
  /^\/\//,              // Comments
  /^import|^export|^const|^let|^var|^function|^class|^interface|^type/,  // Code keywords
];

// Directories/files to ignore
const IGNORE_DIRS = [
  "node_modules",
  "dist",
  ".git",
  ".vercel",
  "dev-dist",
];

const IGNORE_FILES = [
  ".test.tsx",
  ".spec.tsx",
  ".stories.tsx",
];

/**
 * Check if a string should be ignored
 */
function shouldIgnore(str: string): boolean {
  const trimmed = str.trim();
  
  // Too short or too long
  if (trimmed.length < 2 || trimmed.length > 100) {
    return true;
  }
  
  // Check ignore patterns
  for (const pattern of IGNORE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }
  
  // Check if it's mostly special characters
  const alphaChars = trimmed.match(/[a-zA-Z]/g);
  if (!alphaChars || alphaChars.length < trimmed.length * 0.5) {
    return true;
  }
  
  return false;
}

/**
 * Get component type and app ID from file path
 */
function getFileContext(filePath: string): { componentType: string; appId?: string } {
  const relativePath = relative(process.cwd(), filePath);
  
  // Check if it's a menu bar
  if (relativePath.includes("MenuBar.tsx")) {
    const appMatch = relativePath.match(/apps\/([^/]+)\//);
    return {
      componentType: "menuBar",
      appId: appMatch ? appMatch[1] : undefined,
    };
  }
  
  // Check if it's in an app directory
  const appMatch = relativePath.match(/apps\/([^/]+)\//);
  if (appMatch) {
    return {
      componentType: "appComponent",
      appId: appMatch[1],
    };
  }
  
  // Check if it's a dialog
  if (relativePath.includes("Dialog")) {
    return { componentType: "dialog" };
  }
  
  // Check if it's a layout component
  if (relativePath.includes("layout")) {
    return { componentType: "layout" };
  }
  
  // Default
  return { componentType: "component" };
}

/**
 * Generate translation key suggestion
 */
function suggestTranslationKey(
  str: string,
  filePath: string,
  context: string,
  appId?: string
): string {
  // Check common strings first
  if (COMMON_STRINGS[str]) {
    return COMMON_STRINGS[str];
  }
  
  // Generate key based on context
  const keyBase = toTranslationKey(str);
  
  if (context === "menuBar" && appId) {
    return `apps.${appId}.menu.${keyBase}`;
  }
  
  if (context === "appComponent" && appId) {
    return `apps.${appId}.${keyBase}`;
  }
  
  if (context === "dialog") {
    return `common.dialog.${keyBase}`;
  }
  
  // Generic fallback
  const relativePath = relative(process.cwd(), filePath);
  const pathParts = relativePath.split("/").filter(p => p && !p.includes("."));
  const namespace = pathParts.slice(0, -1).join(".");
  
  return namespace ? `${namespace}.${keyBase}` : `common.${keyBase}`;
}

/**
 * Convert string to camelCase translation key
 */
function toTranslationKey(str: string): string {
  return str
    .replace(/\.\.\./g, "")
    .replace(/[^\w\s]/g, "")
    .trim()
    .split(/\s+/)
    .map((word, i) => 
      i === 0 
        ? word.toLowerCase() 
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join("");
}

/**
 * Extract strings from a TSX file
 */
async function analyzeFile(filePath: string): Promise<FileAnalysis> {
  const content = await readFile(filePath, "utf-8");
  const lines = content.split("\n");
  const context = getFileContext(filePath);
  
  // Check if file already uses translations
  const hasTranslation = content.includes("useTranslation") && content.includes('t("');
  
  const strings: ExtractedString[] = [];
  const foundStrings = new Set<string>();
  
  lines.forEach((line, index) => {
    // Skip imports, comments, and code-only lines
    if (
      line.trim().startsWith("import") ||
      line.trim().startsWith("export") ||
      line.trim().startsWith("//") ||
      line.trim().startsWith("*") ||
      line.trim().startsWith("/*") ||
      line.includes("console.") ||
      line.includes("TODO:") ||
      line.includes("FIXME:")
    ) {
      return;
    }
    
    // Skip lines that already use t() or translation hooks
    if (
      line.includes('t("') ||
      line.includes("t('") ||
      line.includes("t(`") ||
      line.includes("useTranslation") ||
      line.includes("getTranslated")
    ) {
      return;
    }
    
    // Skip lines with template literals that use t()
    if (line.includes("${t(") || line.includes("${ t(")) {
      return;
    }
    
    // Extract strings using patterns
    for (const pattern of STRING_PATTERNS) {
      const matches = line.matchAll(pattern);
      for (const match of matches) {
        // Handle different pattern groups
        const stringValue = match[2] || match[1];
        if (stringValue) {
          const original = stringValue.trim();
          
          // Skip if should be ignored or already found
          if (shouldIgnore(original) || foundStrings.has(original)) {
            continue;
          }
          
          foundStrings.add(original);
          
          // Determine context
          let contextType = "text";
          if (line.includes("<Button") || line.includes("<button")) {
            contextType = "button";
          } else if (line.includes("<Label") || line.includes("<label")) {
            contextType = "label";
          } else if (line.includes("DropdownMenuItem") || line.includes("MenuItem")) {
            contextType = "menuItem";
          } else if (line.includes("<Dialog") || line.includes("DialogTitle")) {
            contextType = "dialog";
          } else if (line.includes("<h") || line.includes("Heading")) {
            contextType = "heading";
          } else if (line.includes("<p") || line.includes("Paragraph")) {
            contextType = "paragraph";
          }
          
          const suggestedKey = suggestTranslationKey(
            original,
            filePath,
            context.componentType,
            context.appId
          );
          
          strings.push({
            file: relative(process.cwd(), filePath),
            line: index + 1,
            original,
            suggestedKey,
            context: contextType,
          });
        }
      }
    }
  });
  
  return {
    file: relative(process.cwd(), filePath),
    componentType: context.componentType,
    appId: context.appId,
    hasTranslation,
    strings,
  };
}

/**
 * Recursively find all TSX files
 */
async function findTsxFiles(
  dir: string,
  excludeDirs: string[] = [],
  pattern?: string
): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      // Skip ignored directories
      if (
        entry.isDirectory() &&
        (IGNORE_DIRS.includes(entry.name) || excludeDirs.includes(entry.name))
      ) {
        continue;
      }
      
      if (entry.isDirectory()) {
        files.push(...(await findTsxFiles(fullPath, excludeDirs, pattern)));
      } else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".d.tsx")) {
        // Check if file should be ignored
        const shouldIgnoreFile = IGNORE_FILES.some(ignore => entry.name.includes(ignore));
        if (shouldIgnoreFile) {
          continue;
        }
        
        // Check pattern filter
        if (pattern && !entry.name.includes(pattern)) {
          continue;
        }
        
        files.push(fullPath);
      }
    }
  } catch {
    // Ignore permission errors
  }
  
  return files;
}

async function main() {
  // Parse arguments
  const args = process.argv.slice(2);
  const dirArg = args.find((arg) => arg.startsWith("--dir="))?.split("=")[1];
  const patternArg = args.find((arg) => arg.startsWith("--pattern="))?.split("=")[1];
  const excludeArg = args.find((arg) => arg.startsWith("--exclude="))?.split("=")[1];
  const excludeDirs = excludeArg ? excludeArg.split(",") : [];
  
  const startDir = dirArg ? join(process.cwd(), dirArg) : join(process.cwd(), "src");
  
  console.log("🔍 Analyzing TSX files for untranslated strings...\n");
  console.log(`📁 Directory: ${relative(process.cwd(), startDir)}`);
  if (patternArg) console.log(`🔎 Pattern: ${patternArg}`);
  if (excludeDirs.length > 0) console.log(`🚫 Excluding: ${excludeDirs.join(", ")}`);
  console.log();
  
  // Find all TSX files
  const files = await findTsxFiles(startDir, excludeDirs, patternArg);
  console.log(`Found ${files.length} TSX file(s) to analyze\n`);
  
  // Analyze each file
  const analyses: FileAnalysis[] = [];
  
  for (const file of files) {
    try {
      const analysis = await analyzeFile(file);
      analyses.push(analysis);
    } catch {
      console.log(`⚠️  Could not read ${relative(process.cwd(), file)}`);
    }
  }
  
  // Filter out files with no strings or already translated
  const untranslated = analyses.filter(
    (a) => !a.hasTranslation && a.strings.length > 0
  );
  const translated = analyses.filter((a) => a.hasTranslation);
  
  // Summary
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("                    TRANSLATION STATUS                         ");
  console.log("═══════════════════════════════════════════════════════════════\n");
  
  console.log(`✅ Translated (${translated.length}):`);
  translated.slice(0, 10).forEach((a) => console.log(`   - ${a.file}`));
  if (translated.length > 10) {
    console.log(`   ... and ${translated.length - 10} more`);
  }
  
  console.log(`\n❌ Needs Translation (${untranslated.length}):`);
  untranslated.forEach((a) => console.log(`   - ${a.file} (${a.strings.length} strings)`));
  
  // Detailed output
  if (untranslated.length > 0) {
    console.log("\n═══════════════════════════════════════════════════════════════");
    console.log("                    STRINGS TO TRANSLATE                      ");
    console.log("═══════════════════════════════════════════════════════════════\n");
    
    for (const analysis of untranslated) {
      console.log(`📄 ${analysis.file} (${analysis.componentType}${analysis.appId ? `, ${analysis.appId}` : ""})`);
      console.log("─".repeat(60));
      
      // Group by context
      const byContext = analysis.strings.reduce((acc, str) => {
        if (!acc[str.context]) acc[str.context] = [];
        acc[str.context].push(str);
        return acc;
      }, {} as Record<string, ExtractedString[]>);
      
      for (const [context, strings] of Object.entries(byContext)) {
        console.log(`\n   ${context}:`);
        strings.slice(0, 5).forEach((str) => {
          console.log(`     Line ${str.line}: "${str.original}"`);
          console.log(`     → Key: ${str.suggestedKey}`);
        });
        if (strings.length > 5) {
          console.log(`     ... and ${strings.length - 5} more`);
        }
      }
      console.log();
    }
  }
  
  // Summary stats
  const totalStrings = untranslated.reduce((sum, a) => sum + a.strings.length, 0);
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("                         SUMMARY                              ");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`Total files analyzed: ${analyses.length}`);
  console.log(`Already translated: ${translated.length}`);
  console.log(`Needs translation: ${untranslated.length}`);
  console.log(`Total strings found: ${totalStrings}`);
  
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: bun run scripts/extract-strings.ts [options]

Options:
  --dir=<path>        Scan specific directory (default: src)
  --pattern=<text>    Only scan files matching pattern (e.g., MenuBar)
  --exclude=<dirs>    Comma-separated list of directories to exclude
  --help, -h          Show this help message

Examples:
  bun run scripts/extract-strings.ts
  bun run scripts/extract-strings.ts --dir=src/apps
  bun run scripts/extract-strings.ts --pattern=MenuBar
  bun run scripts/extract-strings.ts --exclude=test,spec
`);
  }
}

main().catch(console.error);

