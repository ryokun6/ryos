import type { DictionaryEntry } from "../../../src/shared/dictionary.js";

/**
 * Surface forms whose endings look inflected but are not.
 * Morphological rules skip these; a Wiktionary "form of …" gloss can still redirect.
 */
const NOT_INFLECTED = new Set([
  "this",
  "his",
  "plus",
  "thus",
  "yes",
  "news",
  "series",
  "species",
  "atlas",
  "chaos",
]);

/** Forms the suffix rules cannot recover (strong verbs, irregular plurals). */
const IRREGULAR: Record<string, string> = {
  took: "take",
  taken: "take",
  ran: "run",
  went: "go",
  gone: "go",
  was: "be",
  were: "be",
  been: "be",
  did: "do",
  done: "do",
  saw: "see",
  seen: "see",
  came: "come",
  ate: "eat",
  eaten: "eat",
  made: "make",
  said: "say",
  got: "get",
  gotten: "get",
  gave: "give",
  given: "give",
  found: "find",
  left: "leave",
  felt: "feel",
  kept: "keep",
  held: "hold",
  told: "tell",
  sold: "sell",
  bought: "buy",
  brought: "bring",
  thought: "think",
  caught: "catch",
  taught: "teach",
  fought: "fight",
  sought: "seek",
  built: "build",
  sent: "send",
  spent: "spend",
  lost: "lose",
  won: "win",
  met: "meet",
  led: "lead",
  fed: "feed",
  sat: "sit",
  stood: "stand",
  understood: "understand",
  wrote: "write",
  written: "write",
  spoke: "speak",
  spoken: "speak",
  broke: "break",
  broken: "break",
  chose: "choose",
  chosen: "choose",
  drove: "drive",
  driven: "drive",
  rode: "ride",
  ridden: "ride",
  rose: "rise",
  risen: "rise",
  fell: "fall",
  fallen: "fall",
  flew: "fly",
  flown: "fly",
  grew: "grow",
  grown: "grow",
  knew: "know",
  known: "know",
  threw: "throw",
  thrown: "throw",
  drew: "draw",
  drawn: "draw",
  drank: "drink",
  drunk: "drink",
  sang: "sing",
  sung: "sing",
  swam: "swim",
  swum: "swim",
  rang: "ring",
  rung: "ring",
  began: "begin",
  begun: "begin",
  became: "become",
  children: "child",
  men: "man",
  women: "woman",
  mice: "mouse",
  geese: "goose",
  feet: "foot",
  teeth: "tooth",
  oxen: "ox",
  dying: "die",
  lying: "lie",
  tying: "tie",
};

/**
 * "plural of run", "simple past of take", "third-person singular present of run".
 * Ordinary definitions ("a clear liquid") do not match.
 */
const FORM_LABEL =
  "plural|past|present|gerund|participle|comparative|superlative|singular|conjugation|inflection|form|tense|indicative|genitive";
/** "plural of run", "simple past of take", "present participle and gerund of run". */
const FORM_OF_GLOSS = new RegExp(
  `^(?:(?:simple|third-person|singular|plural|present|past|perfect|progressive|agent|indicative)\\s+)*(?:${FORM_LABEL})(?:\\s+and\\s+(?:${FORM_LABEL}))?\\s+of\\s+([a-z][a-z'-]{1,40})\\.?$`,
  "i"
);

export function lemmaFromFormOfGloss(gloss: string): string | null {
  const match = gloss.trim().match(FORM_OF_GLOSS);
  if (!match) return null;
  return match[1].toLowerCase();
}

export function hasSubstantiveDefinition(
  entry: DictionaryEntry | null | undefined
): entry is DictionaryEntry {
  if (!entry) return false;
  return entry.senses.some((sense) =>
    sense.glosses.some((gloss) => gloss.trim().length > 0 && !lemmaFromFormOfGloss(gloss))
  );
}

/** Hide "past participle of …" lines once the entry has a real definition. */
export function dropFormOfGlosses(entry: DictionaryEntry): DictionaryEntry {
  const senses = entry.senses.flatMap((sense) => {
    const glosses = sense.glosses.filter((gloss) => !lemmaFromFormOfGloss(gloss));
    if (glosses.length === 0) return [];
    return [{ ...sense, glosses }];
  });
  if (senses.length === 0) return entry;
  return { ...entry, senses };
}

/** First line is "plural of water" / "simple past of take" — follow that lemma. */
export function leadingFormOfLemma(entry: DictionaryEntry | null | undefined): string | null {
  const first = entry?.senses[0]?.glosses[0];
  if (!first) return null;
  return lemmaFromFormOfGloss(first);
}

/** Keep extra senses from an inflected form (waters → amniotic fluid) after the lemma. */
export function mergeSurfaceSenses(base: DictionaryEntry, surface: DictionaryEntry): DictionaryEntry {
  const seen = new Set(base.senses.flatMap((sense) => sense.glosses.map((gloss) => gloss.toLowerCase())));
  const extras = dropFormOfGlosses(surface)
    .senses.filter((sense) => sense.glosses.some((gloss) => !seen.has(gloss.toLowerCase())))
    .slice(0, 2);
  if (extras.length === 0) return base;
  return { ...base, senses: [...base.senses, ...extras].slice(0, 8) };
}

export function formOfLemmas(entry: DictionaryEntry | null | undefined): string[] {
  if (!entry) return [];
  const lemmas: string[] = [];
  for (const sense of entry.senses) {
    for (const gloss of sense.glosses) {
      const lemma = lemmaFromFormOfGloss(gloss);
      if (!lemma || lemmas.includes(lemma)) continue;
      lemmas.push(lemma);
    }
  }
  return lemmas;
}

function pushUnique(out: string[], word: string, candidate: string) {
  if (!candidate || candidate === word || out.includes(candidate) || candidate.length < 2) return;
  out.push(candidate);
}

/** ies/ied: studies → study, dies → die. */
function ieToY(stem: string): string {
  if (stem.length <= 1) return `${stem}ie`;
  return `${stem}y`;
}

function stemVariants(stem: string): string[] {
  if (stem.length < 2) return [];
  const last = stem.at(-1) ?? "";
  const doubled =
    stem.length >= 3 && last === stem.at(-2) && /[^aeiou]/.test(last);
  if (doubled) return [stem.slice(0, -1)];
  if (stem.endsWith("e") || /[aeiou]$/.test(stem)) return [stem];
  // taking → take, loved → love; walked → walk is the second try.
  return [stem + "e", stem];
}

/**
 * Candidate base forms for an English surface form.
 * The exact word is not included. Empty when the word does not look inflected.
 * Callers should try these only after the surface form itself has no real definition.
 */
export function englishLemmaCandidates(word: string): string[] {
  const raw = word.trim().toLowerCase();
  if (raw.endsWith("'s")) {
    const base = raw.slice(0, -2);
    return /^[a-z]{2,}$/.test(base) ? [base] : [];
  }
  if (!/^[a-z]+$/.test(raw)) return [];
  const irregular = IRREGULAR[raw];
  if (irregular) return [irregular];
  if (raw.length < 4 || NOT_INFLECTED.has(raw)) return [];

  const out: string[] = [];
  const add = (candidate: string) => pushUnique(out, raw, candidate);

  if (raw.endsWith("ies")) {
    add(ieToY(raw.slice(0, -3)));
    return out;
  }
  if (raw.endsWith("ied")) {
    add(ieToY(raw.slice(0, -3)));
    return out;
  }
  if (raw.endsWith("ves")) {
    const stem = raw.slice(0, -3);
    add(stem + "f");
    add(stem + "fe");
    return out;
  }
  if (raw.endsWith("ing")) {
    for (const candidate of stemVariants(raw.slice(0, -3))) add(candidate);
    return out;
  }
  if (raw.endsWith("ed")) {
    for (const candidate of stemVariants(raw.slice(0, -2))) add(candidate);
    return out;
  }
  // boxes → box, goes → go. "takes" does not match and falls through to -s.
  if (/(?:[aeiou](?:s|x|z)|ch|sh|o)es$/.test(raw)) {
    add(raw.slice(0, -2));
    return out;
  }
  if (raw.endsWith("s") && !raw.endsWith("ss")) {
    add(raw.slice(0, -1));
  }
  return out;
}
