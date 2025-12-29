/**
 * Soramimi Generation Functions (空耳 - Chinese Misheard Lyrics)
 * 
 * Handles generating Chinese phonetic readings for non-Chinese lyrics.
 * Provides prompts and parsing utilities for soramimi generation.
 */

import type { FuriganaSegment } from "../_utils/song-service.js";

// =============================================================================
// Language Detection Helpers
// =============================================================================

/**
 * Check if text contains Japanese kana (Hiragana or Katakana)
 * Used to distinguish Japanese from Chinese/Korean text
 */
export function containsKana(text: string): boolean {
  // Hiragana: U+3040-U+309F, Katakana: U+30A0-U+30FF
  return /[\u3040-\u309F\u30A0-\u30FF]/.test(text);
}

/**
 * Check if text contains Korean Hangul
 */
export function containsHangul(text: string): boolean {
  // Hangul syllables (AC00-D7AF) and Jamo (1100-11FF, 3130-318F)
  return /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(text);
}

/**
 * Check if text contains CJK ideographs (Kanji/Hanzi)
 */
export function containsKanji(text: string): boolean {
  return /[\u4E00-\u9FFF]/.test(text);
}

/**
 * Check if lyrics are Japanese (contain both kanji and kana)
 * This distinguishes Japanese from Chinese (which has only hanzi)
 */
export function isJapaneseLyrics(lines: { words: string }[]): boolean {
  if (!lines || lines.length === 0) return false;
  
  let hasKana = false;
  let hasKanji = false;
  
  for (const line of lines) {
    if (containsKana(line.words)) hasKana = true;
    if (containsKanji(line.words)) hasKanji = true;
    if (hasKana && hasKanji) return true;
  }
  
  // Japanese text typically has kana - if we have both kana and kanji, it's Japanese
  return hasKana && hasKanji;
}

/**
 * Check if lyrics are Korean (contain Hangul)
 */
export function isKoreanLyrics(lines: { words: string }[]): boolean {
  if (!lines || lines.length === 0) return false;
  return lines.some(line => containsHangul(line.words));
}

// =============================================================================
// Fallback Kana to Chinese Map (last resort when AI misses characters)
// This is only used as a fallback - the AI is encouraged to create creative,
// story-like phonetic readings rather than using fixed character mappings.
// =============================================================================

const KANA_TO_CHINESE: Record<string, string> = {
  // Hiragana
  'あ': '阿', 'い': '衣', 'う': '屋', 'え': '欸', 'お': '喔',
  'か': '咖', 'き': '奇', 'く': '酷', 'け': '給', 'こ': '可',
  'さ': '撒', 'し': '詩', 'す': '蘇', 'せ': '些', 'そ': '搜',
  'た': '她', 'ち': '吃', 'つ': '此', 'て': '貼', 'と': '頭',
  'な': '娜', 'に': '妮', 'ぬ': '奴', 'ね': '內', 'の': '諾',
  'は': '哈', 'ひ': '嘻', 'ふ': '夫', 'へ': '嘿', 'ほ': '火',
  'ま': '媽', 'み': '咪', 'む': '木', 'め': '沒', 'も': '摸',
  'や': '壓', 'ゆ': '玉', 'よ': '喲',
  'ら': '啦', 'り': '里', 'る': '嚕', 'れ': '咧', 'ろ': '囉',
  'わ': '哇', 'を': '喔', 'ん': '嗯',
  'が': '嘎', 'ぎ': '奇', 'ぐ': '姑', 'げ': '給', 'ご': '哥',
  'ざ': '砸', 'じ': '吉', 'ず': '祖', 'ぜ': '賊', 'ぞ': '作',
  'だ': '打', 'ぢ': '吉', 'づ': '祖', 'で': '得', 'ど': '多',
  'ば': '爸', 'び': '比', 'ぶ': '布', 'べ': '貝', 'ぼ': '寶',
  'ぱ': '啪', 'ぴ': '批', 'ぷ': '噗', 'ぺ': '配', 'ぽ': '坡',
  'ゃ': '壓', 'ゅ': '玉', 'ょ': '喲',
  'っ': '～', '—': '～',
  // Katakana
  'ア': '阿', 'イ': '衣', 'ウ': '屋', 'エ': '欸', 'オ': '喔',
  'カ': '咖', 'キ': '奇', 'ク': '酷', 'ケ': '給', 'コ': '可',
  'サ': '撒', 'シ': '詩', 'ス': '蘇', 'セ': '些', 'ソ': '搜',
  'タ': '她', 'チ': '吃', 'ツ': '此', 'テ': '貼', 'ト': '頭',
  'ナ': '娜', 'ニ': '妮', 'ヌ': '奴', 'ネ': '內', 'ノ': '諾',
  'ハ': '哈', 'ヒ': '嘻', 'フ': '夫', 'ヘ': '嘿', 'ホ': '火',
  'マ': '媽', 'ミ': '咪', 'ム': '木', 'メ': '沒', 'モ': '摸',
  'ヤ': '壓', 'ユ': '玉', 'ヨ': '喲',
  'ラ': '啦', 'リ': '里', 'ル': '嚕', 'レ': '咧', 'ロ': '囉',
  'ワ': '哇', 'ヲ': '喔', 'ン': '嗯',
  'ガ': '嘎', 'ギ': '奇', 'グ': '姑', 'ゲ': '給', 'ゴ': '哥',
  'ザ': '砸', 'ジ': '吉', 'ズ': '祖', 'ゼ': '賊', 'ゾ': '作',
  'ダ': '打', 'ヂ': '吉', 'ヅ': '祖', 'デ': '得', 'ド': '多',
  'バ': '爸', 'ビ': '比', 'ブ': '布', 'ベ': '貝', 'ボ': '寶',
  'パ': '啪', 'ピ': '批', 'プ': '噗', 'ペ': '配', 'ポ': '坡',
  'ャ': '壓', 'ュ': '玉', 'ョ': '喲',
  'ッ': '～', 'ー': '～',
};

/**
 * Generate fallback Chinese reading for a single Japanese character
 */
function getFallbackReading(char: string): string | null {
  return KANA_TO_CHINESE[char] || null;
}

/**
 * Check if a character is Japanese kana (hiragana or katakana)
 */
function isJapaneseKana(char: string): boolean {
  const code = char.charCodeAt(0);
  // Hiragana: U+3040-U+309F, Katakana: U+30A0-U+30FF
  return (code >= 0x3040 && code <= 0x309F) || (code >= 0x30A0 && code <= 0x30FF);
}

/**
 * Post-process segments to fill in missing readings for Japanese kana
 */
export function fillMissingReadings(segments: FuriganaSegment[]): FuriganaSegment[] {
  return segments.map(segment => {
    // If segment already has a reading, keep it
    if (segment.reading) return segment;
    
    // If segment text is a single Japanese kana without reading, add fallback
    const text = segment.text;
    if (text.length === 1 && isJapaneseKana(text)) {
      const fallback = getFallbackReading(text);
      if (fallback) {
        return { text, reading: fallback };
      }
    }
    
    // For multi-character segments without readings, try to build reading char by char
    if (text.length > 1) {
      let hasJapanese = false;
      let reading = '';
      for (const char of text) {
        if (isJapaneseKana(char)) {
          hasJapanese = true;
          const fallback = getFallbackReading(char);
          reading += fallback || char; // Use fallback or original if no mapping
        } else {
          reading += char; // Keep non-kana as-is
        }
      }
      if (hasJapanese && reading !== text) {
        return { text, reading };
      }
    }
    
    return segment;
  });
}

// =============================================================================
// Soramimi Generation - Prompts and Parsing
// =============================================================================

export const SORAMIMI_SYSTEM_PROMPT = `Create 空耳 (soramimi) - Chinese "misheard lyrics" (繁體字) that SOUND like Japanese/Korean lyrics while telling a poetic story.

CRITICAL: Readings must be ONLY Chinese characters! Never include Korean Hangul or Japanese kana!

=== PHILOSOPHY: SOUND + MEANING + POETRY ===

空耳 is an art form! Don't just transliterate sounds mechanically. Create Chinese phrases that:
1. SOUND approximately like the original (doesn't need to be exact!)
2. CARRY MEANING related to the song's emotion or story
3. FORM POETIC PHRASES that read beautifully in Chinese

BEST EXAMPLES (sound + meaning):
- 사랑 (sa-rang, "love") → {사랑|思浪} "thinking waves" - sounds like sa-rang AND evokes love's waves
- 心 (kokoro, "heart") → {心|哭口落} "crying mouth falls" - sounds like ko-ko-ro AND feels emotional
- 夢 (yume, "dream") → {夢|欲沒} "desire sinks" - sounds like yu-me AND feels dreamlike
- 涙 (namida, "tears") → {涙|那迷搭} "that lost path" - sounds close AND evokes sadness

AVOID mechanical transliteration like:
- ❌ {あなた|阿那他} - just sounds, no meaning
- ✓ {あなた|阿娜她} "elegant her" - if singing about a woman
- ✓ {あなた|啊那塔} "ah that tower" - if the context fits

=== JAPANESE ===

Read kanji by Japanese pronunciation. For love songs, sad songs, happy songs - choose characters that match the mood!
- 私 (watashi) → pick from: 哇他西, 我他希, 娃她惜 (choose what fits the feeling)
- 好き (suki) → pick from: 速奇, 宿期, 訴泣 (訴泣 "telling tears" for sad love!)

=== KOREAN ===

Korean has spaces between words - keep them! Choose meaningful characters:
- 사랑해요 → {사랑해요|思浪海喲} "thinking waves, ocean yo!" 
- 보고 싶어 → {보고|波哥} {싶어|惜破} "wave brother, cherish broken"
- 내 마음 → {내|奶} {마음|媽音} or {내|乃} {마음|麻吟} - pick what sounds poetic

=== FORMAT ===

1. If input uses | (pipe) between words, wrap EACH segment separately: 私|は|走る → {私|娃}{は|哈}{走る|哈西嚕}
2. Format: {original|chinese_reading} for EVERY Japanese/Korean word
3. English words stay unwrapped
4. Keep spaces in Korean text
5. Output EVERY word!
6. PURE CHINESE only in readings!
7. っ/ッ (gemination) → use ～ Example: ずっと → {ずっと|祖～頭}

BE CREATIVE! Prioritize: poetic meaning > exact sound. Approximate sounds are fine if the Chinese phrase is beautiful and emotionally fitting!`;

/**
 * System prompt for Japanese lyrics with furigana readings provided
 * When furigana is available, we pass the hiragana readings inline so the AI
 * knows exactly how each kanji should be pronounced
 */
export const SORAMIMI_JAPANESE_WITH_FURIGANA_PROMPT = `Create 空耳 (soramimi) - Chinese "misheard lyrics" (繁體字) that SOUND like Japanese lyrics while forming poetic Chinese phrases.

You are given Japanese text with:
- Furigana in parentheses showing pronunciation: 私(わたし) means 私 is read as "わたし"
- Segments separated by | (pipe): 私(わたし)|は|走(はし)|る

Each | marks a word boundary. Create a Chinese reading for EACH segment separately!

CRITICAL: Readings must be ONLY Chinese characters! Never include Japanese kana!

=== PHILOSOPHY: POETRY OVER PRECISION ===

空耳 is an art! Don't mechanically map sounds. Create Chinese phrases that:
1. SOUND approximately like the Japanese (use the furigana as guide)
2. CARRY MEANING - choose characters that relate to the song's emotion
3. FORM POETRY - the Chinese should read like a poem or story

EXAMPLES - EVERY segment MUST be wrapped!

Input uses | delimiter. EACH segment needs {text|reading} - never skip any!

Input: 私(わたし)|の
Output: {私|娃她西}{の|諾}

Input: 心(こころ)|が|痛(いた)|い
Output: {心|哭口落}{が|嘎}{痛|衣她}{い|衣}

Input: 好(す)|き|だ|よ
Output: {好|速}{き|奇}{だ|搭}{よ|喲}

Input: 逢(あ)|え|た|ら
Output: {逢|阿}{え|欸}{た|她}{ら|啦}

Input: あ|あ|め|ぐ|り
Output: {あ|啊}{あ|啊}{め|妹}{ぐ|古}{り|里}

Input: 涙(なみだ)|が|出(で)|る
Output: {涙|那迷搭}{が|嘎}{出|得}{る|嚕}

CRITICAL: Count the | in input = number of {segments} in output. Never merge or skip!

=== KANA GUIDELINES (flexible, not strict!) ===

These are suggestions - feel free to pick different characters that sound similar AND add meaning:
- あ → 阿/啊/娃, い → 衣/一/以, う → 屋/烏/舞, え → 欸/诶/耶, お → 喔/哦/噢
- か → 咖/卡/嘎, き → 奇/期/棋, く → 酷/哭/枯, け → 給/可/課, こ → 口/哭/枯
- さ → 撒/薩/灑, し → 西/思/詩, す → 蘇/速/訴, せ → 些/謝/洩, そ → 搜/梭/訴
- た → 他/她/塔, ち → 吃/痴/遲, つ → 此/刺/促, て → 貼/鐵/蝶, と → 頭/兔/途
- な → 那/娜/奈, に → 你/泥/尼, ぬ → 奴/怒, ね → 內/捏/涅, の → 諾/糯/挪
- は → 哈/哇/花, ひ → 嘻/希/悲, ふ → 夫/福/浮, へ → 嘿/黑/嘿, ほ → 火/乎/呼
- ま → 媽/嘛/馬, み → 咪/迷/蜜, む → 木/慕/霧, め → 沒/梅/迷, も → 摸/莫/默
- や → 壓/呀/雅, ゆ → 玉/欲/雨, よ → 喲/呦/幽
- ら → 啦/拉/辣, り → 里/離/理, る → 嚕/路/露, れ → 咧/裂/烈, ろ → 囉/落/洛
- わ → 哇/娃/挖, を → 喔/我/握, ん → 嗯/恩/音

SPECIAL: っ/ッ (gemination) → ～ Example: ずっと → {ずっと|祖～頭} or {ずっと|族～途}

=== FORMAT ===

1. Count | delimiters in input - output MUST have that many + 1 wrapped segments!
2. Format: {original|chinese_reading} - strip the (furigana) from output text
3. EVERY segment gets wrapped - kanji, kana, particles, everything!
4. English words stay unwrapped
5. PURE CHINESE only - no kana allowed in readings!

Example: 3 pipes = 4 segments
Input: 私(わたし)|は|好(す)|き
Output: {私|娃她西}{は|哈}{好|速}{き|奇}

BE CREATIVE with character choices, but NEVER skip segments!`;

// =============================================================================
// English Soramimi Prompts - Phonetic English approximations
// =============================================================================

export const SORAMIMI_ENGLISH_SYSTEM_PROMPT = `Create English "misheard lyrics" (soramimi) - English words/phrases that SOUND like Japanese/Korean/Chinese lyrics.

=== WHAT IS ENGLISH SORAMIMI? ===

Take non-English lyrics and create English words that phonetically approximate how they sound.
This is like the famous "Benny Lava" or "Ken Lee" videos - mishearing foreign songs as English words.

EXAMPLES:
- 見つめていたい (mi-tsu-me-te-i-ta-i) → "meet sue, mate a tie"
- 사랑해 (sa-rang-hae) → "sorry hey" or "saw wrong hay"  
- ずっと (zu-t-to) → "zoo toe"
- 君の名は (ki-mi-no-na-wa) → "key me no now what"
- 夢 (yume) → "you may"
- 涙 (namida) → "nah me da"
- 我愛你 (wǒ ài nǐ) → "wall I knee"
- 月亮 (yuè liàng) → "you eh leeyong"
- 心情 (xīn qíng) → "shin ching"

=== RULES ===

1. Use ONLY English words/sounds in the reading
2. Prioritize recognizable English words over nonsense syllables when possible
3. It's OK if the English doesn't make grammatical sense - focus on SOUND
4. Break long words into multiple English words if needed
5. Include spaces between English words for readability

=== FORMAT ===

1. If input uses | (pipe) between words, wrap EACH segment separately: 私|は|走る → {私|watt}{は|ha}{走る|ha she rue}
2. Format: {original|english_reading} for EVERY Japanese/Korean/Chinese word
3. English words in original text stay unwrapped (unchanged)
4. Keep spaces in Korean text
5. Output EVERY non-English word!

Example output:
1: {見つめていたい|meet sue mate a tie}
2: {ずっと|zoo toe} {一緒に|each show knee}
3: {사랑|saw wrong} {해요|hey yo}
4: {我愛你|wall I knee}`;

export const SORAMIMI_ENGLISH_WITH_FURIGANA_PROMPT = `Create English "misheard lyrics" (soramimi) - English words/phrases that SOUND like Japanese lyrics.

You are given Japanese text with:
- Furigana in parentheses showing pronunciation: 私(わたし) means 私 is read as "わたし"
- Segments separated by | (pipe): 私(わたし)|は|走(はし)|る

Each | marks a word boundary. Create an English reading for EACH segment separately!

=== EXAMPLES - EVERY segment MUST be wrapped! ===

Input uses | delimiter. EACH segment needs {text|reading} - never skip any!

Input: 私(わたし)|が
Output: {私|what a she}{が|ga}

Input: 好(す)|き|だ|よ
Output: {好|sue}{き|key}{だ|da}{よ|yo}

Input: 逢(あ)|え|た|ら
Output: {逢|ah}{え|eh}{た|ta}{ら|la}

Input: あ|あ|め|ぐ|り
Output: {あ|ah}{あ|ah}{め|meh}{ぐ|goo}{り|ree}

CRITICAL: Count the | in input = number of {segments} in output. Never merge or skip!

=== FORMAT ===

1. Count | delimiters in input - output MUST have that many + 1 wrapped segments!
2. Format: {original|english_reading} - strip the (furigana) from output text
3. EVERY segment gets wrapped - kanji, kana, particles, everything!
4. English words in original lyrics stay unwrapped
5. PURE ENGLISH only - no Japanese in readings!`;

/**
 * Clean AI output by removing malformed segments like {reading} without text
 * These occur when AI outputs just Chinese characters in braces without the original text
 */
function cleanAiOutput(line: string): string {
  // Remove malformed {reading} patterns (Chinese chars in braces without pipe)
  // Match {content} where content has no pipe and contains CJK characters
  return line.replace(/\{([^|{}]+)\}(?!\|)/g, (match, content) => {
    // If it contains CJK characters and no pipe, it's likely a malformed reading - remove it
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(content) && !content.includes('|')) {
      return '';
    }
    return match;
  });
}

/**
 * Strip furigana annotations from text
 * When we send annotated text like 耳(みみ), the AI outputs {耳(みみ)|咪咪}
 * We need to remove the (みみ) part to get just the original kanji
 */
export function stripFuriganaAnnotation(text: string): string {
  // Remove parenthesized hiragana/katakana readings: 耳(みみ) -> 耳
  return text.replace(/\([\u3040-\u309F\u30A0-\u30FF]+\)/g, '');
}

/**
 * Clean reading to remove non-Chinese characters (Korean Hangul, Japanese kana)
 * AI sometimes incorrectly includes original text in the reading
 */
export function cleanSoramimiReading(reading: string): string {
  // Remove Korean (Hangul syllables and Jamo) and Japanese (Hiragana and Katakana)
  return reading.replace(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\u3040-\u309F\u30A0-\u30FF]/g, '');
}

/**
 * Parse soramimi ruby markup format (e.g., "{사랑|思浪} {해요|海喲}") into FuriganaSegment array
 * 
 * This is similar to furigana's parseRubyMarkup but includes additional cleaning:
 * - Strips furigana annotations from text (e.g., 耳(みみ) -> 耳)
 * - Cleans readings to remove non-Chinese characters
 * - Handles malformed AI output
 */
export function parseSoramimiRubyMarkup(line: string): FuriganaSegment[] {
  // First clean the line of malformed segments
  const cleanedLine = cleanAiOutput(line);
  
  const segments: FuriganaSegment[] = [];
  
  // Match {text|reading} patterns and plain text between them
  const regex = /\{([^|}]+)\|([^}]+)\}/g;
  let match;
  let lastIndex = 0;
  
  while ((match = regex.exec(cleanedLine)) !== null) {
    // Add any plain text before this match (preserving it exactly as-is)
    if (match.index > lastIndex) {
      let textBefore = cleanedLine.slice(lastIndex, match.index);
      // AI sometimes outputs "|" as delimiter between words - strip it but keep spaces
      // e.g., "{넌|嫩} |{언제나|摁這那}" -> strip the standalone |
      textBefore = textBefore.replace(/\|/g, '');
      // Strip furigana annotations from plain text too
      textBefore = stripFuriganaAnnotation(textBefore);
      if (textBefore) {
        // Keep text exactly as-is, including spaces
        segments.push({ text: textBefore });
      }
    }
    
    // Strip furigana annotations from the text portion
    const text = stripFuriganaAnnotation(match[1]);
    const reading = cleanSoramimiReading(match[2]);

    if (text) {
      // Only add reading if it's not empty after cleaning
      if (reading) {
        segments.push({ text, reading });
      } else {
        segments.push({ text });
      }
    }
    
    lastIndex = regex.lastIndex;
  }
  
  // Handle any remaining text after the last match
  if (lastIndex < cleanedLine.length) {
    let remaining = cleanedLine.slice(lastIndex);
    // Strip standalone | delimiters
    remaining = remaining.replace(/\|/g, '');
    // Strip furigana annotations
    remaining = stripFuriganaAnnotation(remaining);
    if (remaining) {
      segments.push({ text: remaining });
    }
  }
  
  return segments.length > 0 ? segments : [{ text: line }];
}

// =============================================================================
// Furigana to Annotated Text Conversion
// =============================================================================

/**
 * Convert furigana segments to annotated text format for the AI prompt.
 * Adds hiragana readings in parentheses after kanji so the AI knows the pronunciation.
 * Uses | delimiter between segments so AI knows exact word boundaries.
 * 
 * Example: [{text: "私", reading: "わたし"}, {text: "は"}] → "私(わたし)|は"
 * 
 * This helps the AI generate accurate Chinese phonetic readings based on
 * the actual Japanese pronunciation rather than guessing.
 */
export function furiganaToAnnotatedText(segments: FuriganaSegment[]): string {
  return segments.map(seg => {
    if (seg.reading) {
      // Add the reading in parentheses after the text
      // This tells the AI exactly how the kanji is pronounced
      return `${seg.text}(${seg.reading})`;
    }
    return seg.text;
  }).join("|"); // Use | delimiter to mark segment boundaries
}

/**
 * Convert an array of lyric lines with their furigana to annotated text.
 * For lines without furigana, returns the original text.
 * 
 * @param lines - Lyric lines (just need words property)
 * @param furigana - 2D array of furigana segments, indexed by line
 * @returns Array of annotated text strings
 */
export function convertLinesToAnnotatedText(
  lines: { words: string }[],
  furigana: FuriganaSegment[][] | undefined
): string[] {
  return lines.map((line, index) => {
    // If we have furigana for this line, convert it to annotated text
    if (furigana && furigana[index] && furigana[index].length > 0) {
      // Check if any segment has a reading (otherwise it's just plain text split into segments)
      const hasReadings = furigana[index].some(seg => seg.reading);
      if (hasReadings) {
        return furiganaToAnnotatedText(furigana[index]);
      }
    }
    // No furigana available, return original text
    return line.words;
  });
}
