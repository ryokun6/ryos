/**
 * Pure helpers for discovering Vite chunk references inside built JS / HTML.
 *
 * Kept dependency-free (no React / stores / browser globals) so it can be unit
 * tested in isolation and reused by the prefetch graph walk.
 */

/**
 * Parse a JS chunk body (or index.html) for references to other `/assets/*.js`
 * chunks so the prefetcher can walk the full dynamic-import graph.
 *
 * Vite emits chunk references in a few shapes, all of which we must catch so
 * that deeply nested / second-level dynamic imports are prefetched too:
 *   - relative imports:       import"./Foo-hash.js"
 *   - __vite__mapDeps arrays: ["assets/ai-sdk-hash.js","assets/pusher-hash.js"]
 *   - absolute worker URLs:   new URL("/assets/spotlightSearch.worker-hash.js",…)
 *
 * Chunk basenames can contain dots (e.g. phosphor's `Microphone.es-hash.js`),
 * so the filename character class must include `.` alongside word chars and
 * dashes. The `assets/` | `./` prefix anchor keeps us from matching unrelated
 * property accesses like `obj.json`; any false positive just 404s harmlessly.
 *
 * @returns deduped chunk filenames (no leading path), e.g. `Foo-hash.js`
 */
export function parseChunkReferences(code: string): string[] {
  const refs = new Set<string>();
  const pattern = /(?:assets\/|\.\/)([\w.-]+\.js)/g;
  for (const match of code.matchAll(pattern)) {
    const filename = match[1];
    // Defensive: only keep genuine .js chunk filenames.
    if (filename.endsWith(".js")) {
      refs.add(filename);
    }
  }
  return [...refs];
}
