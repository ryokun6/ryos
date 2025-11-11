#!/usr/bin/env bun
/**
 * 品牌信息批量替换脚本
 * 将代码库中的所有 "ryo"/"Ryo"/"ryOS" 等替换为 "zi"/"Zi"/"ZiOS"
 */

import { readdir, readFile, stat, writeFile } from "fs/promises";
import { join, extname } from "path";

// 需要排除的目录和文件
const EXCLUDE_DIRS = [
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".vercel",
  ".cursor",
  ".vscode",
  "coverage",
  ".turbo",
];

const EXCLUDE_FILES = [
  "bun.lock",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  ".DS_Store",
  "replace-branding.ts", // 排除脚本自身，避免自替换
];

// 需要排除的文件扩展名（二进制文件）
const EXCLUDE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp3",
  ".mp4",
  ".webm",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
];

// 替换规则
const REPLACEMENTS: Array<{ pattern: RegExp; replacement: string; description: string }> = [
  // 系统名称
  { pattern: /\bryOS\b/g, replacement: "ZiOS", description: "系统名称 ryOS -> ZiOS" },
  { pattern: /\bryos\b/g, replacement: "zios", description: "系统名称（小写）ryos -> zios" },
  { pattern: /<span[^>]*>ry<\/span>OS/g, replacement: '<span className="text-blue-500">Zi</span>OS', description: "拆分形式 <span>ry</span>OS -> <span>Zi</span>OS" },
  
  // 人名和昵称
  { pattern: /\bRyo\b/g, replacement: "Zi", description: "人名 Ryo -> Zi" },
  { pattern: /\bryo\b/g, replacement: "zi", description: "昵称 ryo -> zi" },
  
  // URL 和域名
  { pattern: /ryo\.lu/g, replacement: "bravohenry.com", description: "域名 ryo.lu -> bravohenry.com" },
  { pattern: /os\.ryo\.lu/g, replacement: "bravohenry.com", description: "域名 os.ryo.lu -> bravohenry.com" },
  { pattern: /baby-cursor\.ryo\.lu/g, replacement: "bravohenry.com", description: "域名 baby-cursor.ryo.lu -> bravohenry.com" },
  
  // GitHub 仓库
  { pattern: /ryokun6\/ryos/g, replacement: "bravohenry/ziOS", description: "GitHub 仓库 ryokun6/ryos -> bravohenry/ziOS" },
  
  // 变量名和函数名
  { pattern: /\bryoCommand\b/g, replacement: "ziCommand", description: "命令变量 ryoCommand -> ziCommand" },
  { pattern: /\bryoTimeZone\b/g, replacement: "ziTimeZone", description: "时区变量 ryoTimeZone -> ziTimeZone" },
  { pattern: /\bisRyo\b/g, replacement: "isZi", description: "布尔变量 isRyo -> isZi" },
  { pattern: /\bisAuthenticatedRyo\b/g, replacement: "isAuthenticatedZi", description: "认证变量 isAuthenticatedRyo -> isAuthenticatedZi" },
  { pattern: /\bryoMessages\b/g, replacement: "ziMessages", description: "消息变量 ryoMessages -> ziMessages" },
  { pattern: /\bisRyoLoading\b/g, replacement: "isZiLoading", description: "加载状态 isRyoLoading -> isZiLoading" },
  { pattern: /\bstopRyo\b/g, replacement: "stopZi", description: "停止函数 stopRyo -> stopZi" },
  { pattern: /\bhandleRyoMention\b/g, replacement: "handleZiMention", description: "处理函数 handleRyoMention -> handleZiMention" },
  { pattern: /\bUseRyoChat\b/g, replacement: "UseZiChat", description: "类型 UseRyoChat -> UseZiChat" },
  { pattern: /\buseRyoChat\b/g, replacement: "useZiChat", description: "Hook useRyoChat -> useZiChat" },
  { pattern: /\bhandleGenerateRyoReply\b/g, replacement: "handleGenerateZiReply", description: "函数 handleGenerateRyoReply -> handleGenerateZiReply" },
  { pattern: /\bisRyOSHost\b/g, replacement: "isZiOSHost", description: "变量 isRyOSHost -> isZiOSHost" },
  
  // 字符串中的引用
  { pattern: /@ryo\b/g, replacement: "@zi", description: "提及 @ryo -> @zi" },
  { pattern: /"ryo"/g, replacement: '"zi"', description: '字符串 "ryo" -> "zi"' },
  { pattern: /'ryo'/g, replacement: "'zi'", description: "字符串 'ryo' -> 'zi'" },
  { pattern: /`ryo`/g, replacement: "`zi`", description: "模板字符串 `ryo` -> `zi`" },
  
  // 注释和文档
  { pattern: /RYO_PERSONA_INSTRUCTIONS/g, replacement: "ZI_PERSONA_INSTRUCTIONS", description: "常量 RYO_PERSONA_INSTRUCTIONS -> ZI_PERSONA_INSTRUCTIONS" },
  { pattern: /ryoisms/g, replacement: "ziisms", description: "术语 ryoisms -> ziisms" },
];

// 统计信息
interface Stats {
  filesProcessed: number;
  filesModified: number;
  totalReplacements: number;
  replacementsByFile: Map<string, number>;
}

async function shouldProcessFile(filePath: string): Promise<boolean> {
  const fileName = filePath.split("/").pop() || "";
  
  // 排除脚本自身
  if (filePath.includes("replace-branding.ts")) {
    return false;
  }
  
  // 检查文件名
  if (EXCLUDE_FILES.includes(fileName)) {
    return false;
  }
  
  // 检查扩展名
  const ext = extname(fileName).toLowerCase();
  if (EXCLUDE_EXTENSIONS.includes(ext)) {
    return false;
  }
  
  // 检查路径中是否包含排除的目录
  for (const excludeDir of EXCLUDE_DIRS) {
    if (filePath.includes(`/${excludeDir}/`) || filePath.startsWith(`${excludeDir}/`)) {
      return false;
    }
  }
  
  return true;
}

async function processFile(filePath: string, stats: Stats): Promise<void> {
  try {
    const content = await readFile(filePath, "utf-8");
    let modifiedContent = content;
    let fileReplacements = 0;
    
    // 应用所有替换规则
    for (const { pattern, replacement, description } of REPLACEMENTS) {
      const matches = modifiedContent.match(pattern);
      if (matches) {
        modifiedContent = modifiedContent.replace(pattern, replacement);
        fileReplacements += matches.length;
      }
    }
    
    // 如果文件被修改，写入新内容
    if (modifiedContent !== content) {
      await writeFile(filePath, modifiedContent, "utf-8");
      stats.filesModified++;
      stats.totalReplacements += fileReplacements;
      stats.replacementsByFile.set(filePath, fileReplacements);
      console.log(`✓ ${filePath} (${fileReplacements} 处替换)`);
    }
    
    stats.filesProcessed++;
  } catch (error) {
    console.error(`✗ 处理文件失败 ${filePath}:`, error);
  }
}

async function processDirectory(dirPath: string, stats: Stats): Promise<void> {
  try {
    const entries = await readdir(dirPath);
    
    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      const entryStat = await stat(fullPath);
      
      if (entryStat.isDirectory()) {
        // 检查是否应该跳过此目录
        if (!EXCLUDE_DIRS.includes(entry)) {
          await processDirectory(fullPath, stats);
        }
      } else if (entryStat.isFile()) {
        if (await shouldProcessFile(fullPath)) {
          await processFile(fullPath, stats);
        }
      }
    }
  } catch (error) {
    console.error(`✗ 处理目录失败 ${dirPath}:`, error);
  }
}

async function main() {
  const rootDir = process.cwd();
  const stats: Stats = {
    filesProcessed: 0,
    filesModified: 0,
    totalReplacements: 0,
    replacementsByFile: new Map(),
  };
  
  console.log("🚀 开始批量替换品牌信息...\n");
  console.log("替换规则:");
  REPLACEMENTS.forEach(({ description }) => {
    console.log(`  - ${description}`);
  });
  console.log("\n");
  
  await processDirectory(rootDir, stats);
  
  console.log("\n" + "=".repeat(60));
  console.log("📊 替换统计:");
  console.log(`  处理文件数: ${stats.filesProcessed}`);
  console.log(`  修改文件数: ${stats.filesModified}`);
  console.log(`  总替换次数: ${stats.totalReplacements}`);
  
  if (stats.replacementsByFile.size > 0) {
    console.log("\n修改的文件列表:");
    const sortedFiles = Array.from(stats.replacementsByFile.entries())
      .sort((a, b) => b[1] - a[1]);
    
    sortedFiles.forEach(([file, count]) => {
      console.log(`  ${file}: ${count} 处`);
    });
  }
  
  console.log("\n✅ 替换完成！");
}

main().catch((error) => {
  console.error("❌ 脚本执行失败:", error);
  process.exit(1);
});

