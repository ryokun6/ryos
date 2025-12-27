/**
 * Soramimi Generation Functions (空耳 - Chinese Misheard Lyrics)
 * 
 * Handles generating Chinese phonetic readings for non-Chinese lyrics.
 */

import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { logInfo, logError, type LyricLine } from "./_utils.js";
import type { FuriganaSegment } from "../_utils/song-service.js";

// =============================================================================
// Fallback Kana to Chinese Map (for when AI misses characters)
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
function fillMissingReadings(segments: FuriganaSegment[]): FuriganaSegment[] {
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
// English Detection
// =============================================================================

/**
 * Check if a string is primarily English/Latin text
 * Returns true if the string contains mostly ASCII letters, numbers, and common punctuation
 * with no CJK characters (Chinese, Japanese, Korean)
 */
function isEnglishLine(text: string): boolean {
  if (!text || !text.trim()) return true;
  
  const trimmed = text.trim();
  
  // Check for CJK characters (Chinese, Japanese Kanji, Korean Hangul)
  // Also check for Japanese Hiragana and Katakana
  const hasCJK = /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(trimmed);
  
  if (hasCJK) {
    return false;
  }
  
  // If no CJK characters, it's considered English/Latin text
  return true;
}

// =============================================================================
// Soramimi Generation
// =============================================================================

const SORAMIMI_SYSTEM_PROMPT = `Create Chinese 空耳 (soramimi) phonetic readings. Use Traditional Chinese (繁體字).

CRITICAL RULES:
1. EVERY Japanese character (kana, kanji) MUST have a Chinese reading - NO EXCEPTIONS
2. English words stay as plain text WITHOUT braces
3. When Japanese is ADJACENT to English, still wrap the Japanese: {の|諾}Bay City (NOT: のBay City)
4. NEVER group Japanese characters with English - process them separately
5. READING MUST BE 100% CHINESE CHARACTERS - NEVER use Japanese hiragana/katakana in the reading!
   - WRONG: {人|ひ偷} (ひ is Japanese!)
   - CORRECT: {人|嘻偷} (all Chinese)

OKURIGANA RULE (送り仮名) - CRITICAL:
Japanese verbs/adjectives have kanji + okurigana (hiragana suffix). ALWAYS include the okurigana in the text:
- 降りて → {降り|喔里}{て|貼} (NOT: {降|喔里}{て|貼} which loses り)
- 歩きながら → {歩き|啊嚕奇}{ながら|娜嘎啦} (NOT: {歩|啊嚕奇} which loses き)
- 思い出す → {思い|喔摸衣}{出す|打蘇} (NOT: {思|喔摸衣}{出|打蘇})
- 消えそう → {消え|奇欸}{そう|搜屋} (NOT: {消|奇}{え|欸}{そう|搜屋})

Format: {japanese|chinese} for Japanese/Korean, plain text for English

IMPORTANT: Use MEANINGFUL Chinese words when possible!
- Prefer real Chinese words/phrases over random phonetic characters
- Choose characters that sound similar AND have related or interesting meanings
- Use common, recognizable vocabulary

COVERAGE RULES BY LANGUAGE:
- Japanese kana: EACH kana = 1 Chinese char (prefer meaningful chars):
  {な|娜}{に|妮}{げ|給} or {な|那}{に|你}{げ|鬼}
- Japanese kanji: BY SYLLABLE COUNT of the reading, use meaningful words:
  - 愛(あい/ai) "love" = 2 syllables → {愛|哀} (哀 āi = sorrow, poetic!)
  - 夢(ゆめ/yume) "dream" = 2 syllables → {夢|玉美} (玉美 = jade beauty)
  - 雪(ゆき/yuki) "snow" = 2 syllables → {雪|遇奇} (遇奇 = encounter wonder)
  - 君(きみ/kimi) "you" = 2 syllables → {君|奇蜜} (奇蜜 = sweet miracle)
  - 心(こころ/kokoro) "heart" = 3 syllables → {心|叩叩肉} (knocking flesh/heart)
  - 花(はな/hana) "flower" = 2 syllables → {花|哈娜} (哈娜 = a lovely name)
  - 空(そら/sora) "sky" = 2 syllables → {空|搜啦}
  - 歌(うた/uta) "song" = 2 syllables → {歌|嗚她} (cry for her)
- Japanese っ (small tsu) or — (long dash): Use ～ for the pause: {っ|～} or {—|～}
- English: KEEP AS-IS, no Chinese reading: "love" → love, "hello" → hello
- Korean: BY SYLLABLE, prefer meaningful matches:
  - 안녕(annyeong) "peace/hello" → {안|安}{녕|寧} (安寧 = peace, SAME meaning!)
  - 사랑(sarang) "love" → {사|撒}{랑|浪} (撒浪 = scatter waves)
  - 감사(gamsa) "thanks" → {감|甘}{사|謝} (甘謝 = sweet thanks)
  - 행복(haengbok) "happiness" → {행|幸}{복|福} (幸福 = happiness, SAME meaning!)
  - 영원히(yeongwonhi) "forever" → {영|永}{원|遠}{히|嘻} (永遠 = forever!)
  - 시간(sigan) "time" → {시|時}{간|間} (時間 = time, SAME meaning!)
  - 세상(sesang) "world" → {세|世}{상|上} (世上 = world, SAME meaning!)
  - 기억(gieok) "memory" → {기|奇}{억|憶} (奇憶 = wonder + remember)
  - 마음(maeum) "heart" → {마|媽}{음|音} (媽音 = mother's sound)
  - 노래(norae) "song" → {노|諾}{래|來} (諾來 = promise comes)
  - 하늘(haneul) "sky" → {하|哈}{늘|呢}
  - 눈물(nunmul) "tears" → {눈|嫩}{물|木}
  - 미안(mian) "sorry" → {미|迷}{안|安}
  - 좋아해(joahae) "I like you" → {좋|就}{아|啊}{해|嗨}

Format: {original|chinese} for non-English, plain text for English

ADJACENT TEXT RULES (CRITICAL):
- Japanese + English: {日本語|讀音} English words {日本語|讀音}
- WRONG: のBay City (の has no reading!)
- CORRECT: {の|諾}Bay City
- WRONG: 君をlove (を has no reading!)  
- CORRECT: {君|奇蜜}{を|喔}love
- Every particle (の, を, は, が, に, で, と, も, て, etc.) MUST have a reading

LINE RULES:
- Input: "1: text" → Output: "1: {x|讀}..." or "1: english words"
- Keep exact same line numbers

Japanese kana reference (basic phonetic mapping) - MEMORIZE THIS:
あ阿 い衣 う屋 え欸 お喔 | か咖 き奇 く酷 け給 こ可
さ撒 し詩 す蘇 せ些 そ搜 | た她 ち吃 つ此 て貼 と頭
な娜 に妮 ぬ奴 ね內 の諾 | は哈 ひ嘻 ふ夫 へ嘿 ほ火
ま媽 み咪 む木 め沒 も摸 | ら啦 り里 る嚕 れ咧 ろ囉
わ哇 を喔 ん嗯 っ～ —～
が嘎 ぎ奇 ぐ姑 げ給 ご哥 | ざ砸 じ吉 ず祖 ぜ賊 ぞ作
だ打 ぢ吉 づ祖 で得 ど多 | ば爸 び比 ぶ布 べ貝 ぼ寶
ぱ啪 ぴ批 ぷ噗 ぺ配 ぽ坡 | ゃ壓 ゅ玉 ょ喲
ア阿 イ衣 ウ屋 エ欸 オ喔 | カ咖 キ奇 ク酷 ケ給 コ可
サ撒 シ詩 ス蘇 セ些 ソ搜 | タ她 チ吃 ツ此 テ貼 ト頭
ナ娜 ニ妮 ヌ奴 ネ內 ノ諾 | ハ哈 ヒ嘻 フ夫 ヘ嘿 ホ火
マ媽 ミ咪 ム木 メ沒 モ摸 | ラ啦 リ里 ル嚕 レ咧 ロ囉
ワ哇 ヲ喔 ン嗯 ッ～ ー～

Korean syllable reference (common mappings):
아阿 어喔 오喔 우屋 으嗯 이衣 | 가咖 거哥 고高 구姑 기奇
나娜 너呢 노諾 누奴 니妮 | 다她 더德 도都 두肚 디低
마媽 머摸 모摸 무木 미咪 | 바爸 버波 보寶 부夫 비比
사撒 서些 소搜 수蘇 시詩 | 자渣 저這 조就 주朱 지知
하哈 허賀 호火 후乎 히嘻 | 라啦 러樂 로囉 루嚕 리里

Example:
Input:
1: 夢を見ていた
2: I love you
3: 君をloveしてる
4: 안녕하세요
5: 사랑해 영원히
6: 행복한 시간

Output:
1: {夢|玉美}{を|喔}{見|咪}{て|貼}{い|衣}{た|她}
2: I love you
3: {君|奇蜜}{を|喔}love{し|詩}{て|貼}{る|嚕}
4: {안|安}{녕|寧}{하|哈}{세|些}{요|喲}
5: {사|撒}{랑|浪}{해|嗨} {영|永}{원|遠}{히|嘻}
6: {행|幸}{복|福}{한|漢} {시|時}{간|間}`;

// AI generation timeout (60 seconds)
const AI_TIMEOUT_MS = 60000;

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
 * Parse ruby markup format (e.g., "{Sor|搜} {ry|哩}") into FuriganaSegment array
 * Preserves spaces as plain text segments for proper timing alignment
 */
function parseRubyMarkup(line: string): FuriganaSegment[] {
  // First clean the line of malformed segments
  const cleanedLine = cleanAiOutput(line);
  
  const segments: FuriganaSegment[] = [];
  
  // Match {text|reading} patterns and plain text between them
  const regex = /\{([^|}]+)\|([^}]+)\}/g;
  let match;
  let lastIndex = 0;
  
  while ((match = regex.exec(cleanedLine)) !== null) {
    // Add any plain text before this match (including spaces)
    if (match.index > lastIndex) {
      const textBefore = cleanedLine.slice(lastIndex, match.index);
      if (textBefore) {
        // Only add non-empty, non-whitespace-only segments, or single space
        if (textBefore === ' ') {
          segments.push({ text: ' ' });
        } else if (textBefore.trim()) {
          segments.push({ text: textBefore.trim() });
        }
      }
    }
    
    const text = match[1];
    const reading = match[2];
    
    if (text) {
      segments.push({ text, reading });
    }
    
    lastIndex = regex.lastIndex;
  }
  
  // Handle any remaining text
  if (lastIndex < cleanedLine.length) {
    const remaining = cleanedLine.slice(lastIndex);
    if (remaining && remaining.trim()) {
      segments.push({ text: remaining.trim() });
    }
  }
  
  return segments.length > 0 ? segments : [{ text: line }];
}

/**
 * Align parsed segments to match the original text by word boundaries
 * Simple approach: match segments to words in original, insert spaces between
 */
function alignSegmentsToOriginal(segments: FuriganaSegment[], original: string): FuriganaSegment[] {
  // Filter out space-only segments (we'll reconstruct spaces from original)
  const contentSegments = segments.filter(s => s.text.trim());
  
  if (contentSegments.length === 0) {
    return [{ text: original }];
  }
  
  const result: FuriganaSegment[] = [];
  let originalIdx = 0;
  let segmentIdx = 0;
  
  while (originalIdx < original.length && segmentIdx < contentSegments.length) {
    const char = original[originalIdx];
    
    // Handle spaces - add them directly
    if (char === ' ') {
      if (result.length > 0 && result[result.length - 1].text !== ' ') {
        result.push({ text: ' ' });
      }
      originalIdx++;
      continue;
    }
    
    const segment = contentSegments[segmentIdx];
    const segmentText = segment.text;
    
    // Try to find this segment starting from current position
    const remainingOriginal = original.slice(originalIdx);
    
    // Case-insensitive search for the segment text
    const matchIndex = remainingOriginal.toLowerCase().indexOf(segmentText.toLowerCase());
    
    if (matchIndex === 0) {
      // Segment matches at current position
      const matchedText = original.slice(originalIdx, originalIdx + segmentText.length);
      result.push({ text: matchedText, reading: segment.reading });
      originalIdx += segmentText.length;
      segmentIdx++;
    } else if (matchIndex > 0 && matchIndex < 3) {
      // Segment is close (within a few chars) - add skipped chars without reading
      for (let i = 0; i < matchIndex; i++) {
        const skippedChar = original[originalIdx + i];
        if (skippedChar === ' ') {
          if (result.length === 0 || result[result.length - 1].text !== ' ') {
            result.push({ text: ' ' });
          }
        } else {
          result.push({ text: skippedChar });
        }
      }
      originalIdx += matchIndex;
      // Don't increment segmentIdx - retry matching the segment
    } else {
      // Segment doesn't match well - add current char and move on
      result.push({ text: char });
      originalIdx++;
      
      // If we've gone too far without finding the segment, skip it
      if (matchIndex < 0 || matchIndex > 10) {
        segmentIdx++;
      }
    }
  }
  
  // Add any remaining original text
  while (originalIdx < original.length) {
    const char = original[originalIdx];
    if (char === ' ') {
      if (result.length === 0 || result[result.length - 1].text !== ' ') {
        result.push({ text: ' ' });
      }
    } else {
      result.push({ text: char });
    }
    originalIdx++;
  }
  
  // Verify reconstruction
  const reconstructed = result.map(s => s.text).join('');
  if (reconstructed !== original) {
    // Alignment failed - return simple fallback with readings where we can find them
    return buildFallbackSegments(segments, original);
  }
  
  return result;
}

/**
 * Fallback: Build segments by splitting original text and matching readings
 */
function buildFallbackSegments(segments: FuriganaSegment[], original: string): FuriganaSegment[] {
  const result: FuriganaSegment[] = [];
  const words = original.split(/(\s+)/); // Split but keep spaces
  
  // Build a map of text -> reading from segments
  const readingMap = new Map<string, string>();
  for (const seg of segments) {
    if (seg.reading && seg.text.trim()) {
      readingMap.set(seg.text.toLowerCase(), seg.reading);
    }
  }
  
  for (const word of words) {
    if (!word) continue;
    
    if (/^\s+$/.test(word)) {
      // It's whitespace
      result.push({ text: ' ' });
    } else {
      // Try to find a reading for this word or its parts
      const reading = readingMap.get(word.toLowerCase());
      if (reading) {
        result.push({ text: word, reading });
      } else {
        // Try to find readings for substrings
        let found = false;
        for (const [text, r] of readingMap) {
          if (word.toLowerCase().startsWith(text)) {
            result.push({ text: word.slice(0, text.length), reading: r });
            if (word.length > text.length) {
              result.push({ text: word.slice(text.length) });
            }
            found = true;
            break;
          }
        }
        if (!found) {
          result.push({ text: word });
        }
      }
    }
  }
  
  return result.length > 0 ? result : [{ text: original }];
}

/** Result of soramimi generation */
export interface SoramimiResult {
  segments: FuriganaSegment[][];
  /** True if AI generation succeeded, false if fallback was used */
  success: boolean;
}

/**
 * Generate soramimi for a chunk of lyrics
 * Returns { segments, success } where success=false means fallback was used (don't cache)
 * 
 * English lines are kept intact without any Chinese phonetic readings.
 */
export async function generateSoramimiForChunk(
  lines: LyricLine[],
  requestId: string
): Promise<SoramimiResult> {
  if (lines.length === 0) {
    return { segments: [], success: true };
  }

  // Separate English lines from non-English lines
  // English lines will be returned as-is without soramimi processing
  const lineInfo = lines.map((line, originalIndex) => ({
    line,
    originalIndex,
    isEnglish: isEnglishLine(line.words),
  }));

  const nonEnglishLines = lineInfo.filter(info => !info.isEnglish);
  const englishCount = lineInfo.filter(info => info.isEnglish).length;

  logInfo(requestId, `Soramimi processing`, { 
    totalLines: lines.length, 
    englishLines: englishCount, 
    nonEnglishLines: nonEnglishLines.length 
  });

  // If all lines are English, return them as plain text
  if (nonEnglishLines.length === 0) {
    logInfo(requestId, `All lines are English, skipping soramimi AI generation`);
    return { 
      segments: lines.map((line) => [{ text: line.words }]),
      success: true 
    };
  }

  // Use numbered lines to help AI maintain line count (only for non-English lines)
  const textsToProcess = nonEnglishLines.map((info, idx) => `${idx + 1}: ${info.line.words}`).join("\n");

  // Create abort controller with timeout
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), AI_TIMEOUT_MS);

  const startTime = Date.now();
  logInfo(requestId, `Soramimi AI generation starting`, { linesCount: nonEnglishLines.length, timeoutMs: AI_TIMEOUT_MS });

  try {
    const { text: responseText } = await generateText({
      model: google("gemini-2.5-flash"),
      messages: [
        { role: "system", content: SORAMIMI_SYSTEM_PROMPT },
        { role: "user", content: textsToProcess },
      ],
      temperature: 0.7,
      abortSignal: abortController.signal,
    });
    
    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;
    logInfo(requestId, `Soramimi AI generation completed`, { durationMs, responseLength: responseText.length });

    // Parse the ruby markup response with line number matching
    const responseLines = responseText.trim().split("\n");
    
    // Build a map of line number -> parsed content (for non-English lines only)
    const lineContentMap = new Map<number, FuriganaSegment[]>();
    for (const responseLine of responseLines) {
      const trimmed = responseLine.trim();
      if (!trimmed) continue;
      
      // Try to extract line number prefix (e.g., "1: content" or "1. content")
      const lineNumMatch = trimmed.match(/^(\d+)[:.\s]\s*(.*)$/);
      if (lineNumMatch) {
        const lineNum = parseInt(lineNumMatch[1], 10);
        const content = lineNumMatch[2];
        lineContentMap.set(lineNum, parseRubyMarkup(content));
      } else {
        // No line number - try to use sequential position
        // This handles cases where AI doesn't include line numbers
        const nextExpectedLine = lineContentMap.size + 1;
        lineContentMap.set(nextExpectedLine, parseRubyMarkup(trimmed));
      }
    }

    const matchedCount = Math.min(lineContentMap.size, nonEnglishLines.length);
    if (matchedCount < nonEnglishLines.length) {
      logInfo(requestId, `Warning: Soramimi response line mismatch - expected ${nonEnglishLines.length}, matched ${matchedCount}`, { 
        expectedLines: nonEnglishLines.length, 
        responseLines: responseLines.length,
        matchedLines: matchedCount,
        willUseFallbackForMissing: true 
      });
    }

    // Build a map from non-English line index (1-based) to parsed segments
    const nonEnglishResultMap = new Map<number, FuriganaSegment[]>();
    for (let i = 0; i < nonEnglishLines.length; i++) {
      const lineNum = i + 1;
      const info = nonEnglishLines[i];
      const rawSegments = lineContentMap.get(lineNum) || [{ text: info.line.words }];
      const original = info.line.words;
      
      // Align segments to original text (handles spacing mismatches)
      const alignedSegments = alignSegmentsToOriginal(rawSegments, original);
      
      // Fill in missing readings for any Japanese characters that AI missed
      const finalSegments = fillMissingReadings(alignedSegments);
      
      nonEnglishResultMap.set(info.originalIndex, finalSegments);
    }

    // Build final result, inserting English lines as plain text
    const segments = lineInfo.map((info) => {
      if (info.isEnglish) {
        // English line: return as plain text without readings
        return [{ text: info.line.words }];
      } else {
        // Non-English line: use the parsed soramimi result
        return nonEnglishResultMap.get(info.originalIndex) || [{ text: info.line.words }];
      }
    });

    return { segments, success: true };
  } catch (error) {
    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;
    const isTimeout = error instanceof Error && error.name === "AbortError";
    logError(requestId, `Soramimi chunk failed${isTimeout ? " (timeout)" : ""}, returning plain text segments as fallback`, { error, durationMs, isTimeout });
    return { 
      segments: lines.map((line) => [{ text: line.words }]),
      success: false 
    };
  }
}
