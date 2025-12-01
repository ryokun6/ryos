import leoProfanity from "leo-profanity";

// Initialize dictionary once when the module is loaded
try {
  leoProfanity.clearList();
  leoProfanity.loadDictionary("en");
  // Keep ability to augment dictionary with custom terms
  leoProfanity.add(["badword1", "badword2", "chink"]);
} catch {
  // Non-fatal during environments where dictionaries are unavailable
}

export const isProfaneUsername = (name) => {
  if (!name) return false;
  const lower = String(name).toLowerCase();
  let normalized = lower.replace(/[\s_\-.]+/g, "");
  normalized = normalized
    .replace(/\$/g, "s")
    .replace(/@/g, "a")
    .replace(/0/g, "o")
    .replace(/[1!]/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t");

  if (typeof leoProfanity?.check === "function" && leoProfanity.check(normalized)) {
    return true;
  }

  try {
    const dict =
      typeof leoProfanity?.list === "function" ? leoProfanity.list() : [];
    for (const term of dict) {
      if (term && term.length >= 3 && normalized.includes(term)) {
        return true;
      }
    }
  } catch {
    // ignore dictionary access errors
  }

  return false;
};

const cleanProfanityToTripleBlocks = (text) => {
  try {
    const cleaned =
      typeof leoProfanity?.clean === "function"
        ? leoProfanity.clean(text, "█")
        : text;
    return cleaned.replace(/█+/g, "███");
  } catch {
    return text;
  }
};

export const filterProfanityPreservingUrls = (content) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urlMatches = [];
  let match;

  while ((match = urlRegex.exec(content)) !== null) {
    urlMatches.push({
      url: match[1],
      start: match.index,
      end: match.index + match[1].length,
    });
  }

  if (urlMatches.length === 0) {
    return cleanProfanityToTripleBlocks(content);
  }

  let result = "";
  let lastIndex = 0;

  for (const urlMatch of urlMatches) {
    const beforeUrl = content.substring(lastIndex, urlMatch.start);
    result += cleanProfanityToTripleBlocks(beforeUrl);
    result += urlMatch.url;
    lastIndex = urlMatch.end;
  }

  if (lastIndex < content.length) {
    const afterLastUrl = content.substring(lastIndex);
    result += cleanProfanityToTripleBlocks(afterLastUrl);
  }

  return result;
};
