import type { AnyExtension, JSONContent } from "@tiptap/core";

type TipTapModules = {
  generateHTML: (json: JSONContent, extensions: AnyExtension[]) => string;
  generateJSON: (html: string, extensions: AnyExtension[]) => JSONContent;
  extensions: AnyExtension[];
};

let _cache: TipTapModules | null = null;
let _loading: Promise<TipTapModules> | null = null;

function loadModules(): Promise<TipTapModules> {
  if (_cache) return Promise.resolve(_cache);
  if (_loading) return _loading;

  _loading = Promise.all([
    import("@tiptap/core"),
    import("@tiptap/starter-kit"),
    import("@tiptap/extension-underline"),
    import("@tiptap/extension-text-align"),
    import("@tiptap/extension-task-list"),
    import("@tiptap/extension-task-item"),
  ]).then(
    ([
      { generateHTML, generateJSON },
      { default: StarterKit },
      { default: Underline },
      { default: TextAlign },
      { default: TaskList },
      { default: TaskItem },
    ]) => {
      _cache = {
        generateHTML,
        generateJSON,
        extensions: [
          StarterKit,
          Underline,
          TextAlign.configure({ types: ["heading", "paragraph"] }),
          TaskList,
          TaskItem.configure({ nested: true }),
        ] as AnyExtension[],
      };
      return _cache;
    }
  );

  return _loading;
}

/**
 * Async version — always works, triggers lazy load on first call.
 */
export async function generateHtmlFromJson(json: JSONContent): Promise<string> {
  const { generateHTML, extensions } = await loadModules();
  return generateHTML(json, extensions);
}

/**
 * Async version — always works, triggers lazy load on first call.
 */
export async function generateJsonFromHtml(html: string): Promise<JSONContent> {
  const { generateJSON, extensions } = await loadModules();
  return generateJSON(html, extensions);
}

/**
 * Sync version — returns null if modules are not yet loaded.
 * Safe to use in synchronous contexts: when a TextEdit instance has content,
 * TipTap will already be in memory (loaded by the TextEdit component itself).
 */
export function generateHtmlFromJsonSync(json: JSONContent): string | null {
  if (!_cache) return null;
  return _cache.generateHTML(json, _cache.extensions);
}
