#!/usr/bin/env bun
/**
 * Generate static HTML documentation pages from markdown files.
 * Outputs directly to public/docs/ for static serving.
 * 
 * Supports hierarchical navigation with numbered sections:
 * - 1-overview.md (main section)
 * - 1.1-architecture.md (subsection)
 * - 1.2-desktop.md (subsection)
 * - 2-ai-integration.md (main section)
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

  // Extract code blocks first (handle mermaid specially)
  const codeBlocks: string[] = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    if (lang === 'mermaid') {
      // Mermaid diagrams - render as div for client-side rendering
      codeBlocks.push(`<pre class="mermaid">${code.trimEnd()}</pre>`);
    } else {
      const escaped = escapeHtml(code.trimEnd());
      codeBlocks.push(`<pre><code>${escaped}</code></pre>`);
    }
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  // Inline code - process before other text processing to avoid conflicts
  // Must escape HTML entities inside inline code to prevent <title>, <script>, etc. from being interpreted
  html = html.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);

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

  // Headers (process in order from most # to least)
  html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Process lists - handle both unordered (*, -, +) and ordered (1., 2., etc.) lists with nesting
  // First pass: convert individual list items to temporary markers
  const listItems: { type: 'ul' | 'ol'; content: string; indent: number }[] = [];
  
  // Collect all list items with their positions
  html = html.replace(/^(\s*)([*+-])\s+(.+)$/gm, (match, indent, marker, content) => {
    const idx = listItems.length;
    listItems.push({ type: 'ul', content, indent: indent.length });
    return `__LIST_ITEM_${idx}__`;
  });
  
  html = html.replace(/^(\s*)(\d+)\.\s+(.+)$/gm, (match, indent, num, content) => {
    const idx = listItems.length;
    listItems.push({ type: 'ol', content, indent: indent.length });
    return `__LIST_ITEM_${idx}__`;
  });
  
  // Merge list item blocks separated by single blank lines (for numbered lists with gaps)
  html = html.replace(/(__LIST_ITEM_\d+__)\n\n(__LIST_ITEM_\d+__)/g, '$1\n$2');
  html = html.replace(/(__LIST_ITEM_\d+__)\n\n(__LIST_ITEM_\d+__)/g, '$1\n$2'); // Run twice for multiple gaps
  
  // Second pass: group consecutive list items and build nested structure
  html = html.replace(/(__LIST_ITEM_\d+__\n?)+/g, (match) => {
    const indices = [...match.matchAll(/__LIST_ITEM_(\d+)__/g)].map(m => parseInt(m[1]));
    if (indices.length === 0) return match;
    
    // Build nested list HTML with proper nesting
    let result = '';
    const stack: { type: 'ul' | 'ol'; indent: number; hasOpenLi: boolean }[] = [];
    
    for (let i = 0; i < indices.length; i++) {
      const item = listItems[indices[i]];
      const nextItem = i < indices.length - 1 ? listItems[indices[i + 1]] : null;
      
      // Close nested lists and li's when going to same or lower indent
      while (stack.length > 0 && stack[stack.length - 1].indent > item.indent) {
        const popped = stack.pop()!;
        if (popped.hasOpenLi) result += '</li>';
        result += `</${popped.type}>`;
      }
      
      // Close previous li if at same indent level  
      if (stack.length > 0 && stack[stack.length - 1].indent === item.indent && stack[stack.length - 1].hasOpenLi) {
        result += '</li>';
        stack[stack.length - 1].hasOpenLi = false;
      }
      
      // Open new list if needed (first item or deeper indent)
      if (stack.length === 0 || item.indent > stack[stack.length - 1].indent) {
        result += `<${item.type}>`;
        stack.push({ type: item.type, indent: item.indent, hasOpenLi: false });
      }
      
      // Add the list item
      result += `<li>${item.content}`;
      stack[stack.length - 1].hasOpenLi = true;
      
      // Close li immediately if next item is at same or lower indent (not nested)
      if (!nextItem || nextItem.indent <= item.indent) {
        result += '</li>';
        stack[stack.length - 1].hasOpenLi = false;
      }
    }
    
    // Close all remaining open tags
    while (stack.length > 0) {
      const popped = stack.pop()!;
      if (popped.hasOpenLi) result += '</li>';
      result += `</${popped.type}>`;
    }
    
    return result + '\n';
  });

  // Bold and italic
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Convert file path references to GitHub links
  html = html.replace(/<code>([^<]*)<\/code>/g, (match, content) => {
    if (match.includes('http') || match.includes('github.com') || match.includes('href=')) return match;
    
    let filePathMatch = content.match(/(src\/|api\/|scripts\/|docs\/|public\/)([a-zA-Z0-9_\-/.]+\.(tsx?|jsx?|json|css|html|md|sh|mdc))/);
    
    let fullPath: string | null = null;
    
    if (filePathMatch) {
      fullPath = filePathMatch[1] + filePathMatch[2];
    } else {
      filePathMatch = content.match(/([a-zA-Z0-9_\-/]+)\/([a-zA-Z0-9_\-/.]+\.(tsx?|jsx?|json|css|html|md|sh|mdc))/);
      if (filePathMatch && filePathMatch[1] && filePathMatch[2]) {
        const folder = filePathMatch[1];
        const filename = filePathMatch[2];
        const firstSegment = folder.split('/')[0];
        
        if (appContext && (firstSegment === 'components' || firstSegment === 'hooks' || firstSegment === 'utils' || firstSegment === 'tools' || firstSegment === 'commands' || firstSegment === 'extensions')) {
          fullPath = `src/apps/${appContext}/${folder}/${filename}`;
        } else if (firstSegment === 'stores' || firstSegment === 'lib' || firstSegment.startsWith('contexts') || firstSegment.startsWith('types')) {
          fullPath = `src/${folder}/${filename}`;
        } else {
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

  // Paragraphs
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
  filename: string;
  sectionNum: string;      // e.g., "1", "1.1", "2", "2.1"
  parentSection?: string;  // e.g., "1" for "1.1"
  children: DocEntry[];
}

// Parse section number from filename (e.g., "1-overview.md" -> "1", "1.1-architecture.md" -> "1.1")
function parseSectionNumber(filename: string): string {
  const match = filename.match(/^(\d+(?:\.\d+)?)-/);
  return match ? match[1] : "";
}

// Get parent section (e.g., "1.1" -> "1", "2.3" -> "2")
function getParentSection(sectionNum: string): string | undefined {
  if (sectionNum.includes('.')) {
    return sectionNum.split('.')[0];
  }
  return undefined;
}

// Sort by section number (1, 1.1, 1.2, 2, 2.1, etc.)
function sortBySectionNumber(a: DocEntry, b: DocEntry): number {
  const partsA = a.sectionNum.split('.').map(Number);
  const partsB = b.sectionNum.split('.').map(Number);
  
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] ?? 0;
    const numB = partsB[i] ?? 0;
    if (numA !== numB) return numA - numB;
  }
  return 0;
}

function generateSidebar(currentDoc: DocEntry, allDocs: DocEntry[]): string {
  // Build tree structure
  const rootDocs: DocEntry[] = [];
  const childMap = new Map<string, DocEntry[]>();

  // First pass: identify root docs and build child map
  for (const doc of allDocs) {
    if (doc.parentSection) {
      const children = childMap.get(doc.parentSection) || [];
      children.push(doc);
      childMap.set(doc.parentSection, children);
    } else {
      rootDocs.push(doc);
    }
  }

  // Sort children
  for (const [key, children] of childMap) {
    childMap.set(key, children.sort(sortBySectionNumber));
  }

  // Build sidebar HTML
  const items: string[] = [];

  for (const doc of rootDocs.sort(sortBySectionNumber)) {
    const children = childMap.get(doc.sectionNum) || [];
    
    if (children.length > 0) {
      // Has children - create collapsible group
      const isCurrentSection = currentDoc.sectionNum === doc.sectionNum || 
                               currentDoc.parentSection === doc.sectionNum;
      const isExpanded = isCurrentSection ? "expanded" : "";
      const childrenDisplay = isCurrentSection ? "block" : "none";
      const svgTransform = isCurrentSection ? "rotate(90deg)" : "rotate(0deg)";
      const ariaExpanded = isCurrentSection ? "true" : "false";

      items.push(`
<div class="nav-group ${isExpanded}">
  <button class="nav-toggle" onclick="toggleNavGroup(this)" aria-expanded="${ariaExpanded}">
    <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" style="transition: transform 0.2s; transform: ${svgTransform};">
      <path d="M2 0v8l4-4z"/>
    </svg>
    <a href="/docs/${doc.id}" class="${currentDoc.id === doc.id ? "active" : ""}">${doc.sectionNum}. ${doc.title}</a>
  </button>
  <div class="nav-children" style="display: ${childrenDisplay};">
    ${children.map(child => 
      `<a href="/docs/${child.id}" class="nav-child ${child.id === currentDoc.id ? "active" : ""}">${child.sectionNum} ${child.title}</a>`
    ).join("\n    ")}
  </div>
</div>`.trim());
    } else {
      // No children - use same structure as toggle but with spacer instead of arrow
      const displayNum = doc.sectionNum ? `${doc.sectionNum}. ` : "";
      items.push(`
<div class="nav-group">
  <div class="nav-toggle nav-no-toggle">
    <span class="nav-spacer"></span>
    <a href="/docs/${doc.id}" class="${doc.id === currentDoc.id ? "active" : ""}">${displayNum}${doc.title}</a>
  </div>
</div>`.trim());
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
    
    .container { display: flex; max-width: 1100px; margin: 0 auto; }
    
    .sidebar {
      width: 220px; flex-shrink: 0;
      border-right: 1px solid #ccc;
      padding: 12px;
      position: sticky; top: 40px;
      height: calc(100vh - 40px);
      overflow-y: auto;
    }
    .sidebar a {
      display: block; padding: 4px 8px; margin: 2px 0;
      text-decoration: none; color: #333;
      font-size: 11px;
    }
    .sidebar a:hover { background: #f0f0f0; }
    .sidebar a.active { background: #000; color: #fff; }
    
    /* Tree hierarchy styles */
    .nav-group { margin: 4px 0; }
    .nav-spacer { width: 8px; flex-shrink: 0; } /* Same width as toggle arrow */
    .nav-no-toggle { cursor: default; }
    .nav-toggle {
      display: flex; align-items: center; gap: 4px;
      background: none; border: none; padding: 0; width: 100%;
      cursor: pointer; text-align: left; font: inherit; color: inherit;
    }
    .nav-toggle:hover { background: #f0f0f0; }
    .nav-toggle svg { flex-shrink: 0; opacity: 0.6; transition: transform 0.2s; }
    .nav-toggle a { flex: 1; padding: 4px 8px; margin: 0; pointer-events: auto; font-size: 11px; }
    .nav-children { margin-left: 12px; overflow: hidden; transition: height 0.2s ease-out; }
    .nav-child { padding-left: 8px !important; font-size: 10px !important; color: #555 !important; }
    .nav-child:hover { color: #000 !important; }
    .nav-child.active { color: #fff !important; }
    
    .content { flex: 1; padding: 24px 32px; min-width: 0; }
    
    /* Typography */
    h1 { font-size: 18px; border-bottom: 1px solid #ccc; padding-bottom: 8px; margin-bottom: 16px; }
    hr { border: none; border-top: 1px solid #ccc; margin: 16px 0; }
    h2 { font-size: 14px; margin: 24px 0 12px; }
    h3 { font-size: 12px; margin: 16px 0 8px; }
    h4 { font-size: 11px; margin: 12px 0 6px; font-weight: bold; }
    p { margin: 8px 0; }
    ul, ol { margin: 8px 0 8px 20px; }
    li { margin: 4px 0; }
    
    /* Tables */
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
    th { background: #f0f0f0; font-weight: bold; }
    
    /* Mermaid diagrams */
    pre.mermaid { background: none; border: none; padding: 0; text-align: center; margin: 16px 0; }
    .mermaid svg { max-width: 100%; height: auto; font-family: "Geneva", system-ui, sans-serif !important; }
    .mermaid .node rect, .mermaid .node circle, .mermaid .node polygon { fill: #f8f8f8 !important; stroke: #ccc !important; }
    .mermaid .edgeLabel { background: #fff !important; font-size: 10px !important; }
    .mermaid .label { font-size: 10px !important; }
    .mermaid .nodeLabel { font-size: 10px !important; }
    .mermaid .cluster-label { font-size: 10px !important; }
    .mermaid .messageText { font-size: 10px !important; }
    .mermaid .actor { font-size: 10px !important; }
    .mermaid .labelText { font-size: 10px !important; }
    
    /* Collapsible details */
    details { margin: 8px 0; }
    details summary { 
      cursor: pointer; 
      color: #666; 
      font-size: 11px;
      padding: 4px 0;
      user-select: none;
    }
    details summary:hover { color: #000; }
    details[open] summary { margin-bottom: 8px; }
    details ul { margin-top: 0; }
    
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
        position: fixed; left: -240px; top: 40px; 
        width: 240px; height: calc(100vh - 40px);
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
        ${prev ? `<a href="/docs/${prev.id}">← ${prev.title}</a>` : "<span></span>"}
        ${next ? `<a href="/docs/${next.id}">${next.title} →</a>` : "<span></span>"}
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
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({
      startOnLoad: true,
      theme: 'base',
      securityLevel: 'loose',
      themeVariables: {
        fontFamily: '"Geneva", system-ui, sans-serif',
        fontSize: '10px',
        primaryColor: '#f0f0f0',
        primaryBorderColor: '#ccc',
        primaryTextColor: '#000',
        lineColor: '#666',
        secondaryColor: '#f8f8f8',
        tertiaryColor: '#fff'
      },
      flowchart: { curve: 'basis', padding: 8, nodeSpacing: 30, rankSpacing: 30 },
      sequence: { actorFontSize: 10, messageFontSize: 10, noteFontSize: 10 }
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
    const sectionNum = parseSectionNumber(file);
    const title = titleMatch ? titleMatch[1] : file.replace(/^\d+(?:\.\d+)?-/, "").replace(".md", "");
    const id = file.replace(/^\d+(?:\.\d+)?-/, "").replace(".md", "");
    const parentSection = getParentSection(sectionNum);
    
    // Extract app name from filename for context (for relative path resolution)
    let appContext: string | undefined;
    const appNameMatch = file.match(/apps?-(.+)\.md$/);
    if (appNameMatch) {
      appContext = appNameMatch[1];
    }
    
    const html = markdownToHtml(content, appContext);
    docs.push({ 
      id, 
      title, 
      html, 
      filename: file, 
      sectionNum,
      parentSection,
      children: []
    });
  }

  // Sort docs by section number
  docs.sort(sortBySectionNumber);

  // Generate individual pages
  for (let i = 0; i < docs.length; i++) {
    const pageHtml = generatePage(docs[i], docs, i);
    await Bun.write(join(OUTPUT_DIR, `${docs[i].id}.html`), pageHtml);
  }

  // Generate index redirect to first doc
  const firstDoc = docs[0];
  const indexHtml = `<!DOCTYPE html>
<html><head><meta http-equiv="refresh" content="0;url=/docs/${firstDoc?.id || 'overview'}"></head></html>`;
  await Bun.write(join(OUTPUT_DIR, "index.html"), indexHtml);

  console.log(`[docs] Generated ${docs.length} pages in ${OUTPUT_DIR}/`);
}

generate().catch((err) => {
  console.error("[docs] Failed:", err);
  process.exit(1);
});
