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

export const SORAMIMI_SYSTEM_PROMPT = `Create 空耳 (soramimi) - Chinese "misheard lyrics" (繁體字) that SOUND like Japanese/Korean lyrics.

CRITICAL RULES:
1. You MUST wrap EVERY non-English word in <original:chinese> format
2. Chinese readings must be ONLY Chinese characters - no Hangul or kana!
3. English words stay unwrapped (no angle brackets)

=== OUTPUT FORMAT (MANDATORY) ===

Format: <original_text:chinese_phonetic_reading>
- The original text goes BEFORE the colon
- The Chinese reading goes AFTER the colon
- Wrap in angle brackets < >

EXAMPLE INPUT:
1: Oh|no|시간이|갈수록|널
2: 사랑해요

EXAMPLE OUTPUT:
1: Oh no <시간이:思干이> <갈수록:嘎蘇录> <널:呢>
2: <사랑해요:思浪海喲>

=== KOREAN EXAMPLES ===

Korean words MUST have Chinese readings:
- 시간이 → <시간이:思干이> (shi-gan-i sounds like 思干이)
- 갈수록 → <갈수록:嘎蘇录> (gal-su-rok sounds like 嘎蘇录)
- 사랑 → <사랑:思浪> (sa-rang sounds like 思浪)
- 해요 → <해요:海喲> (hae-yo sounds like 海喲)
- 보고 싶어 → <보고:波哥> <싶어:希破>

=== JAPANESE EXAMPLES ===

Japanese words MUST have Chinese readings:
- 私 (watashi) → <私:娃他西>
- 好き (suki) → <好き:速奇>
- 心 (kokoro) → <心:哭口落>
- ずっと → <ずっと:祖～頭> (use ～ for っ)

=== PHILOSOPHY ===

空耳 is an art! Choose Chinese characters that:
1. SOUND like the original pronunciation
2. CARRY poetic MEANING when possible
3. Form beautiful Chinese phrases

=== RULES ===

1. EVERY non-English word MUST be wrapped: <word:chinese>
2. English words stay plain (unwrapped)
3. If input has | between words, wrap each segment separately
4. Output one numbered line per input line
5. NEVER output plain Korean/Japanese without <:> wrapper!`;

/**
 * System prompt for Japanese lyrics with furigana readings provided
 * When furigana is available, we pass the hiragana readings inline so the AI
 * knows exactly how each kanji should be pronounced
 */
export const SORAMIMI_JAPANESE_WITH_FURIGANA_PROMPT = `Create 空耳 (soramimi) - Chinese "misheard lyrics" (繁體字) that SOUND like Japanese lyrics.

You are given Japanese text with:
- Furigana in parentheses: 私(わたし) means 私 is read as "わたし"
- Segments separated by | (pipe): 私(わたし)|は|走(はし)|る

CRITICAL RULES:
1. You MUST wrap EVERY segment in <original:chinese> format
2. Chinese readings must be ONLY Chinese characters - no kana!
3. Use the furigana to know correct pronunciation
4. Do NOT include parentheses in output

=== OUTPUT FORMAT (MANDATORY) ===

Format: <original_text:chinese_phonetic_reading>

EXAMPLE INPUT:
1: 私(わたし)|は|好き(すき)|だよ
2: 夢(ゆめ)|を|見(み)|た

EXAMPLE OUTPUT:
1: <私:娃她西><は:哈><好き:速奇><だよ:搭喲>
2: <夢:欲沒><を:喔><見:迷><た:塔>

=== KANA TO CHINESE GUIDE ===

Use the furigana reading to pick Chinese characters that sound similar:
- わたし (watashi) → 娃她西 or 哇他西
- すき (suki) → 速奇 or 蘇奇
- こころ (kokoro) → 哭口落
- なみだ (namida) → 那迷搭
- ゆめ (yume) → 欲沒 or 玉沒

Single kana:
- あ→阿, い→衣, う→屋, え→欸, お→喔
- か→咖, き→奇, く→酷, け→給, こ→口
- さ→撒, し→西, す→蘇, せ→些, そ→搜
- た→他, ち→吃, つ→此, て→貼, と→頭
- な→那, に→你, ぬ→奴, ね→內, の→諾
- は→哈, ひ→嘻, ふ→夫, へ→嘿, ほ→火
- ま→媽, み→咪, む→木, め→沒, も→摸
- や→壓, ゆ→玉, よ→喲
- ら→啦, り→里, る→嚕, れ→咧, ろ→囉
- わ→哇, を→喔, ん→嗯
- っ/ッ → ～ (Example: ずっと → <ずっと:祖～頭>)

=== RULES ===

1. EVERY segment between | MUST be wrapped: <segment:chinese>
2. Remove furigana parentheses from output
3. English words stay unwrapped
4. Output one numbered line per input line
5. NEVER output plain Japanese without <:> wrapper!`;

// =============================================================================
// English Soramimi Prompts - Phonetic English approximations
// =============================================================================

export const SORAMIMI_ENGLISH_SYSTEM_PROMPT = `Create English "misheard lyrics" (soramimi) - English words that SOUND like Japanese/Korean/Chinese lyrics.

This is like "Benny Lava" or "Ken Lee" - mishearing foreign songs as English words.

CRITICAL RULES:
1. You MUST wrap EVERY non-English word in <original:english> format
2. Use real English words that sound like the original
3. English words in lyrics stay unwrapped

=== OUTPUT FORMAT (MANDATORY) ===

Format: <original_text:english_phonetic>

EXAMPLE INPUT:
1: 시간이|갈수록|널
2: 사랑해요
3: Fire in the water

EXAMPLE OUTPUT:
1: <시간이:she gone knee> <갈수록:gal sue rock> <널:null>
2: <사랑해요:saw wrong hey yo>
3: Fire in the water

=== KOREAN EXAMPLES ===

- 시간이 (shi-gan-i) → <시간이:she gone knee>
- 갈수록 (gal-su-rok) → <갈수록:gal sue rock>
- 사랑 (sa-rang) → <사랑:saw wrong>
- 해요 (hae-yo) → <해요:hey yo>
- 보고 싶어 → <보고:bow go> <싶어:ship uh>

=== JAPANESE EXAMPLES ===

- 見つめていたい → <見つめていたい:meet sue mate a tie>
- ずっと → <ずっと:zoo toe>
- 君の名は → <君の名は:key me no now what>
- 私 → <私:what a she>
- 好き → <好き:ski>

=== CHINESE EXAMPLES ===

- 我愛你 → <我愛你:wall I knee>
- 月亮 → <月亮:you eh leeyong>
- 心情 → <心情:shin ching>

=== RULES ===

1. EVERY non-English word MUST be wrapped: <word:english>
2. English words in original lyrics stay plain (unwrapped)
3. Use spaces between English words for readability
4. Output one numbered line per input line
5. NEVER output plain Korean/Japanese/Chinese without <:> wrapper!`;

export const SORAMIMI_ENGLISH_WITH_FURIGANA_PROMPT = `Create English "misheard lyrics" (soramimi) - English words that SOUND like Japanese lyrics.

You are given Japanese text with:
- Furigana in parentheses: 私(わたし) means 私 is read as "わたし"
- Segments separated by | (pipe): 私(わたし)|は|走(はし)|る

CRITICAL RULES:
1. You MUST wrap EVERY segment in <original:english> format
2. Use real English words that sound like the furigana
3. Do NOT include parentheses in output

=== OUTPUT FORMAT (MANDATORY) ===

Format: <original_text:english_phonetic>

EXAMPLE INPUT:
1: 私(わたし)|が|好き(すき)|だよ
2: 夢(ゆめ)|を|見(み)|た

EXAMPLE OUTPUT:
1: <私:what a she><が:ga><好き:ski><だよ:die yo>
2: <夢:you may><を:oh><見:me><た:ta>

=== FURIGANA TO ENGLISH GUIDE ===

Use the furigana to pick English words that sound similar:
- わたし (watashi) → what a she, watt ah she
- すき (suki) → ski, sue key
- こころ (kokoro) → cocoa row, ko ko row
- なみだ (namida) → nah me da
- ゆめ (yume) → you may, you meh
- はしる (hashiru) → ha she roo

=== RULES ===

1. EVERY segment between | MUST be wrapped: <segment:english>
2. Remove furigana parentheses from output
3. English words in original lyrics stay unwrapped
4. Use spaces between English words for readability
5. Output one numbered line per input line
6. NEVER output plain Japanese without <:> wrapper!`;

/**
 * Clean AI output by removing malformed segments like <reading> without proper base:ruby structure
 */
function cleanAiOutput(line: string): string {
  // Remove malformed <reading> patterns (Chinese chars in angle brackets without colon)
  // Match <content> where content has no colon and contains CJK characters
  return line.replace(/<([^:>]+)>(?!:)/g, (match, content) => {
    // If it contains CJK characters and no colon, it's likely a malformed reading - remove it
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(content) && !content.includes(':')) {
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
 * Parse soramimi ruby markup format (e.g., "<사랑:思浪> <해요:海喲>") into FuriganaSegment array
 * 
 * Format: <original:reading> - angle brackets with colon separator
 * 
 * Additional cleaning:
 * - Strips furigana annotations from text (e.g., 耳(みみ) -> 耳)
 * - Cleans readings to remove non-Chinese characters
 * - Handles malformed AI output
 */
export function parseSoramimiRubyMarkup(line: string): FuriganaSegment[] {
  // First clean the line of malformed segments
  const cleanedLine = cleanAiOutput(line);
  
  const segments: FuriganaSegment[] = [];
  
  // Match <text:reading> patterns
  const regex = /<([^:>]+):([^>]+)>/g;
  let match;
  let lastIndex = 0;
  
  while ((match = regex.exec(cleanedLine)) !== null) {
    // Add any plain text before this match (preserving it exactly as-is)
    if (match.index > lastIndex) {
      let textBefore = cleanedLine.slice(lastIndex, match.index);
      // AI sometimes outputs "|" as delimiter between words - strip it but keep spaces
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
