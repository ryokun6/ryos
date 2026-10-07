/**
 * Lazy loader for the vendored HanziLookupJS recognizer (public/vendor/
 * hanzilookup). The script and its ~500 KB (gzipped) stroke database are only
 * fetched the first time the handwriting pad opens.
 */

export type HandwritingPoint = [number, number];
export type HandwritingStroke = HandwritingPoint[];

interface HanziLookupMatch {
  character: string;
  score: number;
}

interface HanziLookupGlobal {
  init: (name: string, url: string, done: (ok: boolean) => void) => void;
  AnalyzedCharacter: new (strokes: HandwritingStroke[]) => unknown;
  Matcher: new (name: string) => {
    match: (
      analyzed: unknown,
      limit: number,
      done: (matches: HanziLookupMatch[]) => void
    ) => void;
  };
  data?: Record<string, unknown>;
}

declare global {
  interface Window {
    HanziLookup?: HanziLookupGlobal;
  }
}

const BASE_PATH = "/vendor/hanzilookup";
const SCRIPT_ID = "ryos-hanzilookup";
const DATASET = "mmah";

let readyPromise: Promise<HanziLookupGlobal> | null = null;
let matcher: InstanceType<HanziLookupGlobal["Matcher"]> | null = null;

function injectScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.HanziLookup?.Matcher) {
      resolve();
      return;
    }
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = `${BASE_PATH}/hanzilookup.min.js`;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Failed to load handwriting recognizer")),
      { once: true }
    );
  });
}

export function loadHandwritingRecognizer(): Promise<HanziLookupGlobal> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Handwriting requires a browser"));
  }
  readyPromise ??= injectScript()
    .then(
      () =>
        new Promise<HanziLookupGlobal>((resolve, reject) => {
          const lookup = window.HanziLookup;
          if (!lookup) {
            reject(new Error("HanziLookup global missing"));
            return;
          }
          if (lookup.data?.[DATASET]) {
            resolve(lookup);
            return;
          }
          lookup.init(DATASET, `${BASE_PATH}/${DATASET}.json`, (ok) =>
            ok
              ? resolve(lookup)
              : reject(new Error("Failed to load handwriting data"))
          );
        })
    )
    .catch((error) => {
      readyPromise = null;
      throw error;
    });
  return readyPromise;
}

export async function recognizeHandwriting(
  strokes: HandwritingStroke[],
  limit = 12
): Promise<string[]> {
  const usable = strokes.filter((stroke) => stroke.length > 1);
  if (usable.length === 0) return [];
  const lookup = await loadHandwritingRecognizer();
  matcher ??= new lookup.Matcher(DATASET);
  const analyzed = new lookup.AnalyzedCharacter(usable);
  return new Promise((resolve) => {
    matcher!.match(analyzed, limit, (matches) =>
      resolve(matches.map((match) => match.character))
    );
  });
}
