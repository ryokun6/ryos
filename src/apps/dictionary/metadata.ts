export { DICTIONARY_HELP_I18N_KEYS } from "./helpKeys";

export const appMetadata = {
  name: "Dictionary",
  version: "1.0.0",
  creator: {
    name: "Ryo Lu",
    url: "https://ryo.lu",
  },
  github: "https://github.com/ryokun6/ryos",
  icon: "/icons/default/dictionary.png",
};

export const helpItems = [
  {
    icon: "🔎",
    title: "Look Up Words",
    description:
      "Search English, Chinese, Japanese, or Korean. Type a word, pinyin, romaji, or an English meaning to find definitions, synonyms, and example sentences.",
  },
  {
    icon: "🗣️",
    title: "Readings",
    description:
      "See pinyin and zhuyin for Chinese, furigana and romaji for Japanese, and romanization for Korean. Toggle them from the Readings menu, and click the speaker to hear a word or example read aloud.",
  },
  {
    icon: "✍️",
    title: "Handwriting",
    description:
      "Open the handwriting pad and draw a Chinese character or kanji. Pick a candidate to add it to your search.",
  },
  {
    icon: "⭐",
    title: "Favorites",
    description:
      "Star words to save them. Favorites sync across devices when Cloud Sync is on.",
  },
  {
    icon: "🃏",
    title: "Flashcards",
    description:
      "Study your favorites with spaced repetition. Flip a card, then grade your recall: Again, Hard, Good, or Easy.",
  },
  {
    icon: "🗂️",
    title: "Decks & Anki",
    description:
      "Group cards into decks from the Deck menu and pick one to study. Import Anki .apkg or .colpkg files with their audio and review history, or export a deck to open in Anki.",
  },
  {
    icon: "✨",
    title: "Ask AI",
    description:
      "When a word isn't in the dictionaries, or you want usage notes and more examples, ask AI. AI answers may contain mistakes.",
  },
];
