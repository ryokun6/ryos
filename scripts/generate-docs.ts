#!/usr/bin/env bun
/**
 * Generate static HTML documentation pages from markdown files.
 * Outputs directly to public/docs/ for static serving.
 */
import { readdir, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const DOCS_DIR = "docs";
const OUTPUT_DIR = "public/docs";
const GITHUB_REPO = "https://github.com/ryokun6/ryos";
const GITHUB_BLOB = `${GITHUB_REPO}/blob/main`;

// Simple markdown to HTML converter
function markdownToHtml(md: string, appContext?: string): string {
  let html = md;

  const escapeHtml = (str: string) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Extract code blocks first
  const codeBlocks: string[] = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang, code) => {
    const escaped = escapeHtml(code.trimEnd());
    codeBlocks.push(`<pre><code>${escaped}</code></pre>`);
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  // Inline code - process before other text processing to avoid conflicts
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Tables
  html = html.replace(
    /\n\|(.+)\|\n\|[-| ]+\|\n((?:\|.+\|\n?)+)/g,
    (_, headerRow, bodyRows) => {
      const headers = headerRow.split("|").map((h: string) => h.trim()).filter(Boolean);
      const headerHtml = headers.map((h: string) => `<th>${h}</th>`).join("");
      const rows = bodyRows.trim().split("\n").map((row: string) => {
        const cells = row.split("|").map((c: string) => c.trim()).filter(Boolean);
        return `<tr>${cells.map((c: string) => `<td>${c}</td>`).join("")}</tr>`;
      }).join("");
      return `\n<table><thead><tr>${headerHtml}</tr></thead><tbody>${rows}</tbody></table>\n`;
    }
  );

  // Headers
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Process lists - handle both unordered (*, -, +) and ordered (1., 2., etc.) lists with nesting
  // Must process BEFORE bold/italic to avoid conflicts with * marker
  html = html.replace(/(\n|^)(([*+-]|\d+\.)\s+.+(\n(?: {2,4}([*+-]|\d+\.)\s+.+| {2,4}[^*\d\-+].+))*)/g, (match, prefix, listContent) => {
    const lines = listContent.split('\n').filter((l: string) => l.trim());
    if (lines.length === 0) return match;

    interface ListItem {
      content: string;
      children: ListItem[];
      type: 'ul' | 'ol';
    }

    interface ListContext {
      type: 'ul' | 'ol';
      indent: number;
      items: ListItem[];
    }

    const listStack: ListContext[] = [];
    const rootItems: ListItem[] = [];
    let currentParent: ListItem[] = rootItems;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Match list item markers
      const ulMatch = line.match(/^(\s*)([*+-])\s+(.+)$/);
      const olMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);

      if (ulMatch || olMatch) {
        const match = ulMatch || olMatch!;
        const indent = match[1].length;
        const content = match[3];
        const type = ulMatch ? 'ul' : 'ol';

        // Find the correct parent list for this indent level
        while (listStack.length > 0 && indent <= listStack[listStack.length - 1].indent) {
          listStack.pop();
        }

        // Determine parent items array based on stack
        if (listStack.length === 0) {
          currentParent = rootItems;
        } else {
          const lastList = listStack[listStack.length - 1];
          if (lastList.items.length > 0) {
            currentParent = lastList.items[lastList.items.length - 1].children;
          } else {
            currentParent = [];
          }
        }

        // Create new item
        const item: ListItem = { content, children: [], type };

        // If we need a new list context (type change or indent increase)
        if (listStack.length === 0 || listStack[listStack.length - 1].type !== type || indent > listStack[listStack.length - 1].indent) {
          listStack.push({ type, indent, items: [item] });
          currentParent.push(item);
        } else {
          // Same list level - just add item to existing list context
          listStack[listStack.length - 1].items.push(item);
          currentParent.push(item);
        }
      } else if (listStack.length > 0) {
        // Continuation line - add to last item of deepest list
        const lastList = listStack[listStack.length - 1];
        if (lastList.items.length > 0) {
          const lastItem = lastList.items[lastList.items.length - 1];
          lastItem.content += ' ' + trimmed;
        }
      }
    }

    // Build HTML from tree structure
    function renderItems(items: ListItem[]): string {
      if (items.length === 0) return '';
      
      let result = '';
      let currentType: 'ul' | 'ol' | null = null;
      let currentGroup: ListItem[] = [];

      for (const item of items) {
        if (currentType !== null && currentType !== item.type) {
          // Type changed - render current group and start new one
          const tag = currentType === 'ul' ? 'ul' : 'ol';
          result += `<${tag}>${currentGroup.map(i => `<li>${i.content}${renderItems(i.children)}</li>`).join('')}</${tag}>`;
          currentGroup = [];
        }
        currentType = item.type;
        currentGroup.push(item);
      }

      // Render final group
      if (currentType !== null && currentGroup.length > 0) {
        const tag = currentType === 'ul' ? 'ul' : 'ol';
        result += `<${tag}>${currentGroup.map(i => `<li>${i.content}${renderItems(i.children)}</li>`).join('')}</${tag}>`;
      }

      return result;
    }

    return prefix + renderItems(rootItems) + '\n';
  });

  // Bold and italic - process after lists to avoid conflicts with list markers
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Convert file path references to GitHub links
  // Handle file paths mentioned in <code> tags (inline code) - these are the most common case
  html = html.replace(/<code>([^<]*)<\/code>/g, (match, content) => {
    if (match.includes('http') || match.includes('github.com') || match.includes('href=')) return match;
    
    // Match file paths with extensions - handle both full paths (src/...) and relative paths (components/...)
    // First try to match full paths with base directory
    let filePathMatch = content.match(/(src\/|api\/|scripts\/|docs\/|public\/)([a-zA-Z0-9_\-/.]+\.(tsx?|jsx?|json|css|html|md|sh|mdc))/);
    
    let fullPath: string | null = null;
    
    if (filePathMatch) {
      // Has base path like src/ or api/
      fullPath = filePathMatch[1] + filePathMatch[2];
    } else {
      // Try to match relative paths without base directory
      filePathMatch = content.match(/([a-zA-Z0-9_\-/]+)\/([a-zA-Z0-9_\-/.]+\.(tsx?|jsx?|json|css|html|md|sh|mdc))/);
      if (filePathMatch && filePathMatch[1] && filePathMatch[2]) {
        // Relative path without base - need to determine correct base path
        const folder = filePathMatch[1];
        const filename = filePathMatch[2];
        
        // Extract the first segment of the path to determine folder type (handle nested paths like "components/screen")
        const firstSegment = folder.split('/')[0];
        
        // Check if this looks like an app-specific component (components/, hooks/, utils/ folders)
        if (appContext && (firstSegment === 'components' || firstSegment === 'hooks' || firstSegment === 'utils' || firstSegment === 'tools' || firstSegment === 'commands' || firstSegment === 'extensions')) {
          // App-specific file - prepend src/apps/{appName}/
          fullPath = `src/apps/${appContext}/${folder}/${filename}`;
        } else if (firstSegment === 'stores' || firstSegment === 'lib' || firstSegment.startsWith('contexts') || firstSegment.startsWith('types')) {
          // Shared src-level file
          fullPath = `src/${folder}/${filename}`;
        } else {
          // Default assumption - try src/ first (covers most cases)
          fullPath = `src/${folder}/${filename}`;
        }
      }
    }
    
    if (!fullPath || !filePathMatch) return match;
    
    const githubUrl = `${GITHUB_BLOB}/${fullPath}`;
    const linkedContent = content.replace(
      filePathMatch[0],
      `<a href="${githubUrl}" target="_blank" rel="noopener noreferrer" style="color: #00f; text-decoration: underline;">${filePathMatch[0]}</a>`
    );
    return `<code>${linkedContent}</code>`;
  });

  // Horizontal rules
  html = html.replace(/^---$/gm, "<hr>");

  // Paragraphs - process last, wrapping text blocks that aren't already HTML
  html = html.split("\n\n").map((block) => {
    block = block.trim();
    if (!block) return "";
    if (block.startsWith("<")) return block;
    if (block.startsWith("__CODE_BLOCK_")) return block;
    return `<p>${block.replace(/\n/g, " ")}</p>`;
  }).join("\n");

  // Restore code blocks
  codeBlocks.forEach((code, i) => {
    html = html.replace(`__CODE_BLOCK_${i}__`, code);
  });

  return html;
}

interface DocEntry {
  id: string;
  title: string;
  html: string;
  isAppDoc?: boolean;
}

function generateSidebar(doc: DocEntry, allDocs: DocEntry[]): string {
  // Separate main docs from app docs
  const mainDocs = allDocs.filter((d) => !d.isAppDoc);
  const appDocs = allDocs.filter((d) => d.isAppDoc);
  
  // Build sidebar items
  const items: string[] = [];
  
  for (const d of mainDocs) {
    if (d.id === "apps" && appDocs.length > 0) {
      // This is the Apps parent - create a collapsible group
      const isCurrentPage = doc.id === "apps" || doc.isAppDoc;
      const isExpanded = isCurrentPage ? "expanded" : "";
      const childrenDisplay = isCurrentPage ? "block" : "none";
      const svgTransform = isCurrentPage ? "rotate(90deg)" : "rotate(0deg)";
      const ariaExpanded = isCurrentPage ? "true" : "false";
      
      // Sort app docs by title for consistent ordering
      const sortedAppDocs = [...appDocs].sort((a, b) => a.title.localeCompare(b.title));
      
      items.push(`
<div class="nav-group ${isExpanded}">
  <button class="nav-toggle" onclick="toggleNavGroup(this)" aria-expanded="${ariaExpanded}">
    <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" style="transition: transform 0.2s; transform: ${svgTransform};">
      <path d="M2 0v8l4-4z"/>
    </svg>
    <a href="/docs/${d.id}.html" class="${doc.id === "apps" ? "active" : ""}">${d.title}</a>
  </button>
  <div class="nav-children" style="display: ${childrenDisplay};">
    ${sortedAppDocs.map((appDoc) => 
      `<a href="/docs/${appDoc.id}.html" class="nav-child ${appDoc.id === doc.id ? "active" : ""}">${appDoc.title}</a>`
    ).join("\n    ")}
  </div>
</div>
      `.trim());
    } else {
      // Regular doc item
      items.push(`<a href="/docs/${d.id}.html" class="${d.id === doc.id ? "active" : ""}">${d.title}</a>`);
    }
  }
  
  return items.join("\n");
}

function generatePage(doc: DocEntry, allDocs: DocEntry[], currentIndex: number): string {
  const prev = currentIndex > 0 ? allDocs[currentIndex - 1] : null;
  const next = currentIndex < allDocs.length - 1 ? allDocs[currentIndex + 1] : null;

  const sidebar = generateSidebar(doc, allDocs);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${doc.title} - ryOS Docs</title>
  <link rel="icon" href="/icons/mac-192.png">
  <style>
    @font-face { font-family: "Geneva"; src: url("/fonts/geneva-12.woff2") format("woff2"); }
    @font-face { font-family: "Monaco"; src: url("/fonts/monacottf.woff2") format("woff2"); }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Geneva", system-ui, sans-serif;
      font-size: 12px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      background: #fff;
      color: #000;
    }
    a { color: #00f; }
    a:hover { text-decoration: none; }
    code, pre { font-family: "Monaco", monospace; font-size: 11px; }
    code { background: #f0f0f0; padding: 1px 4px; }
    pre { background: #f8f8f8; border: 1px solid #ddd; padding: 12px; overflow-x: auto; margin: 12px 0; }
    pre code { background: none; padding: 0; }
    
    /* Layout */
    .header {
      position: sticky; top: 0; z-index: 10;
      background: #fff; border-bottom: 1px solid #ccc;
      padding: 0 16px; height: 40px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .header-left { display: flex; align-items: center; gap: 8px; }
    .header-left img { width: 20px; height: 20px; display: block; }
    .header-left span { font-weight: bold; }
    .header-right { display: flex; align-items: center; gap: 16px; }
    .header-right a { text-decoration: none; color: #333; }
    .header-right a:hover { color: #000; }
    .header-right .github { display: flex; align-items: center; gap: 4px; }
    .header-right .launch { background: #000; color: #fff; padding: 4px 12px; }
    
    .container { display: flex; max-width: 960px; margin: 0 auto; }
    
    .sidebar {
      width: 180px; flex-shrink: 0;
      border-right: 1px solid #ccc;
      padding: 12px;
      position: sticky; top: 40px;
      height: calc(100vh - 40px);
      overflow-y: auto;
    }
    .sidebar a {
      display: block; padding: 4px 8px; margin: 2px 0;
      text-decoration: none; color: #333;
    }
    .sidebar a:hover { background: #f0f0f0; }
    .sidebar a.active { background: #000; color: #fff; }
    
    /* Tree hierarchy styles */
    .nav-group { margin: 4px 0; }
    .nav-toggle {
      display: flex; align-items: center; gap: 4px;
      background: none; border: none; padding: 0; width: 100%;
      cursor: pointer; text-align: left; font: inherit; color: inherit;
    }
    .nav-toggle:hover { background: #f0f0f0; }
    .nav-toggle svg { flex-shrink: 0; opacity: 0.6; transition: transform 0.2s; }
    .nav-toggle a { flex: 1; padding: 4px 8px; margin: 0; pointer-events: auto; }
    .nav-children { margin-left: 12px; overflow: hidden; transition: height 0.2s ease-out; }
    .nav-child { padding-left: 8px; font-size: 11px; }
    
    .content { flex: 1; padding: 24px 32px; min-width: 0; }
    
    /* Typography */
    h1 { font-size: 18px; border-bottom: 1px solid #ccc; padding-bottom: 8px; margin-bottom: 16px; }
    h2 { font-size: 14px; margin: 24px 0 12px; }
    h3 { font-size: 12px; margin: 16px 0 8px; }
    p { margin: 8px 0; }
    ul { margin: 8px 0 8px 20px; }
    li { margin: 4px 0; }
    
    /* Tables */
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
    th { background: #f0f0f0; font-weight: bold; }
    
    /* Navigation */
    .nav { display: flex; justify-content: space-between; margin-top: 32px; padding-top: 16px; border-top: 1px solid #ccc; }
    .nav a { text-decoration: none; color: #333; }
    .nav a:hover { color: #000; }
    
    
    /* Mobile menu button */
    .menu-btn { 
      display: none; 
      background: transparent; 
      border: 0; 
      padding: 4px; 
      cursor: pointer; 
      line-height: 1;
      -webkit-appearance: none;
      appearance: none;
      margin: 0;
      color: inherit;
    }
    .menu-btn svg { display: block; width: 18px; height: 18px; pointer-events: none; }
    @media screen and (max-width: 768px) {
      .menu-btn { 
        display: -webkit-flex !important;
        display: flex !important; 
        -webkit-align-items: center;
        align-items: center; 
        -webkit-justify-content: center;
        justify-content: center;
      }
      .header-left img { display: none !important; }
      .sidebar { 
        position: fixed; left: -200px; top: 40px; 
        width: 200px; height: calc(100vh - 40px);
        background: #fff; z-index: 20;
        transition: left 0.2s;
      }
      .sidebar.open { left: 0; box-shadow: 2px 0 8px rgba(0,0,0,0.1); }
      .content { padding: 16px; }
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="header-left">
      <button class="menu-btn" onclick="document.querySelector('.sidebar').classList.toggle('open')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
      </button>
      <a href="/" style="display:flex;align-items:center;gap:8px;text-decoration:none;color:inherit">
        <img src="/icons/mac-192.png" alt="ryOS" width="20" height="20">
        <span>ryOS</span>
      </a>
      <span style="color:#999">/</span>
      <span style="color:#666">Docs</span>
    </div>
    <div class="header-right">
      <a href="https://github.com/ryokun6/ryos" target="_blank" class="github">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
        GitHub
      </a>
      <a href="/" class="launch">Launch</a>
    </div>
  </header>
  
  <div class="container">
    <nav class="sidebar">
      ${sidebar}
    </nav>
    
    <main class="content">
      <article>
        ${doc.html}
      </article>
      
      <nav class="nav">
        ${prev ? `<a href="/docs/${prev.id}.html">← ${prev.title}</a>` : "<span></span>"}
        ${next ? `<a href="/docs/${next.id}.html">${next.title} →</a>` : "<span></span>"}
      </nav>
      
    </main>
  </div>
  
  <script>
    function toggleNavGroup(button) {
      const group = button.closest('.nav-group');
      const children = group.querySelector('.nav-children');
      const svg = button.querySelector('svg');
      const isExpanded = group.classList.contains('expanded');
      
      if (isExpanded) {
        group.classList.remove('expanded');
        children.style.display = 'none';
        svg.style.transform = 'rotate(0deg)';
        button.setAttribute('aria-expanded', 'false');
      } else {
        group.classList.add('expanded');
        children.style.display = 'block';
        svg.style.transform = 'rotate(90deg)';
        button.setAttribute('aria-expanded', 'true');
      }
    }
    
    document.addEventListener('click', (e) => {
      const sidebar = document.querySelector('.sidebar');
      const menuBtn = document.querySelector('.menu-btn');
      const clickedMenuBtn = menuBtn && menuBtn.contains(e.target);
      if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && !clickedMenuBtn) {
        sidebar.classList.remove('open');
      }
    });
  </script>
</body>
</html>`;
}

async function generate() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const files = await readdir(DOCS_DIR);
  const mdFiles = files.filter((f) => f.endsWith(".md")).sort();

  const docs: DocEntry[] = [];

  for (const file of mdFiles) {
    const content = await readFile(join(DOCS_DIR, file), "utf-8");
    const titleMatch = content.match(/^# (.+)$/m);
    const title = titleMatch ? titleMatch[1] : file.replace(/^\d+-/, "").replace(".md", "");
    const id = file.replace(/^\d+-/, "").replace(".md", "");
    const isAppDoc = file.startsWith("apps-") && file !== "12-apps.md";
    
    // Extract app name from filename for context (e.g., "apps-chats.md" -> "chats")
    let appContext: string | undefined;
    if (isAppDoc) {
      const appNameMatch = file.match(/^apps-(.+)\.md$/);
      if (appNameMatch) {
        appContext = appNameMatch[1];
      }
    }
    
    const html = markdownToHtml(content, appContext);
    docs.push({ id, title, html, isAppDoc });
  }

  // Generate individual pages
  for (let i = 0; i < docs.length; i++) {
    const pageHtml = generatePage(docs[i], docs, i);
    await Bun.write(join(OUTPUT_DIR, `${docs[i].id}.html`), pageHtml);
  }

  // Generate index redirect
  const indexHtml = `<!DOCTYPE html>
<html><head><meta http-equiv="refresh" content="0;url=/docs/overview.html"></head></html>`;
  await Bun.write(join(OUTPUT_DIR, "index.html"), indexHtml);

  console.log(`[docs] Generated ${docs.length} pages in ${OUTPUT_DIR}/`);
}

generate().catch((err) => {
  console.error("[docs] Failed:", err);
  process.exit(1);
});
