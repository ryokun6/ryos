import type { LyricLine, RomanizationSettings } from "@/types/lyrics";
import type { FuriganaSegment } from "@/utils/romanization";
import { toRomaji } from "wanakana";
import {
  hasKoreanText,
  isChineseText,
  hasKanaTextLocal,
  renderKoreanWithRomanization,
  renderChineseWithPinyin,
  renderKanaWithRomaji,
  getKoreanPronunciationOnly,
  getChinesePronunciationOnly,
  getKanaPronunciationOnly,
  getFuriganaSegmentsPronunciationOnly,
} from "@/utils/romanization";

// =============================================================================
// Types
// =============================================================================

export interface RenderLyricsOptions {
  /** Romanization settings from store */
  romanization: RomanizationSettings;
  /** Whether showing original lyrics (not translations) */
  isShowingOriginal: boolean;
  /** Map of startTimeMs -> FuriganaSegment[] */
  furiganaMap: Map<string, FuriganaSegment[]>;
  /** Map of startTimeMs -> SoramimiSegment[] */
  soramimiMap: Map<string, FuriganaSegment[]>;
}

// =============================================================================
// Render Functions
// =============================================================================

/**
 * Renders soramimi segments with ruby annotations.
 */
function renderSoramimiSegments(
  segments: FuriganaSegment[],
  keyPrefix: string,
  pronunciationOnly: boolean,
  targetLanguage?: string
): React.ReactNode {
  // Pronunciation-only mode: show only the soramimi readings
  if (pronunciationOnly) {
    // English soramimi should have spaces between words for readability
    // Korean has natural spaces (preserved as segments), Japanese/Chinese may have AI-added spaces
    // Join with spaces and collapse multiple spaces to avoid double-spacing
    if (targetLanguage === "en") {
      const pronunciationText = segments
        .map((seg) => seg.reading || seg.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      return <span key={keyPrefix}>{pronunciationText}</span>;
    }
    // Chinese soramimi: join without spaces (Chinese characters don't need spacing)
    const pronunciationText = segments.map((seg) => seg.reading || seg.text).join("");
    return <span key={keyPrefix}>{pronunciationText}</span>;
  }

  return (
    <>
      {segments.map((segment, index) => {
        // If there's a reading (the soramimi phonetic), display as ruby
        if (segment.reading) {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: segments are stable and don't reorder
            <ruby key={index} className="lyrics-furigana lyrics-soramimi">
              {segment.text}
              <rp>(</rp>
              <rt className="lyrics-furigana-rt lyrics-soramimi-rt">{segment.reading}</rt>
              <rp>)</rp>
            </ruby>
          );
        }
        // biome-ignore lint/suspicious/noArrayIndexKey: segments are stable and don't reorder
        return <span key={index}>{segment.text}</span>;
      })}
    </>
  );
}

/**
 * Renders furigana segments with ruby annotations and optional romanization.
 */
function renderFuriganaSegments(
  segments: FuriganaSegment[],
  romanization: RomanizationSettings
): React.ReactNode {
  return (
    <>
      {segments.map((segment, index) => {
        // Handle Japanese furigana (hiragana reading over kanji)
        if (segment.reading) {
          const displayReading = romanization.japaneseRomaji
            ? toRomaji(segment.reading)
            : segment.reading;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: segments are stable and don't reorder
            <ruby key={index} className="lyrics-furigana">
              {segment.text}
              <rp>(</rp>
              <rt className="lyrics-furigana-rt">{displayReading}</rt>
              <rp>)</rp>
            </ruby>
          );
        }

        // Korean romanization for mixed content
        if (romanization.korean && hasKoreanText(segment.text)) {
          return renderKoreanWithRomanization(segment.text, `seg-${index}`);
        }

        // Chinese pinyin for mixed content
        if (romanization.chinese && isChineseText(segment.text)) {
          return renderChineseWithPinyin(segment.text, `seg-${index}`);
        }

        // Standalone kana to romaji
        if (romanization.japaneseRomaji && hasKanaTextLocal(segment.text)) {
          return renderKanaWithRomaji(segment.text, `seg-${index}`);
        }

        // biome-ignore lint/suspicious/noArrayIndexKey: segments are stable and don't reorder
        return <span key={index}>{segment.text}</span>;
      })}
    </>
  );
}

/**
 * Try other romanization types when furigana is not available or disabled.
 */
function renderOtherRomanization(
  text: string,
  keyPrefix: string,
  romanization: RomanizationSettings,
  pronunciationOnly: boolean
): React.ReactNode | null {
  // Chinese pinyin
  if (romanization.chinese && isChineseText(text)) {
    if (pronunciationOnly) {
      return <span key={keyPrefix}>{getChinesePronunciationOnly(text)}</span>;
    }
    return renderChineseWithPinyin(text, keyPrefix);
  }

  // Korean romanization
  if (romanization.korean && hasKoreanText(text)) {
    if (pronunciationOnly) {
      return <span key={keyPrefix}>{getKoreanPronunciationOnly(text)}</span>;
    }
    return renderKoreanWithRomanization(text, keyPrefix);
  }

  // Japanese kana to romaji
  if (romanization.japaneseRomaji && hasKanaTextLocal(text)) {
    if (pronunciationOnly) {
      return <span key={keyPrefix}>{getKanaPronunciationOnly(text)}</span>;
    }
    return renderKanaWithRomaji(text, keyPrefix);
  }

  return null;
}

// =============================================================================
// Main Export
// =============================================================================

/**
 * Renders a lyrics line with annotations (furigana, soramimi, romanization).
 *
 * Priority order:
 * 1. Soramimi (if enabled and data available)
 * 2. Furigana (if enabled and data available)
 * 3. Other romanization (Chinese pinyin, Korean, Japanese kana to romaji)
 *
 * @param line - The lyric line to render
 * @param processedText - The processed text content
 * @param options - Rendering options including romanization settings and annotation maps
 * @returns React node with annotations
 */
export function renderLyricsWithAnnotations(
  line: LyricLine,
  processedText: string,
  options: RenderLyricsOptions
): React.ReactNode {
  const { romanization, isShowingOriginal, furiganaMap, soramimiMap } = options;

  // Master toggle - if romanization is disabled, return plain text
  if (!romanization.enabled || !isShowingOriginal) {
    return processedText;
  }

  const keyPrefix = `line-${line.startTimeMs}`;
  const pronunciationOnly = romanization.pronunciationOnly ?? false;

  // Soramimi (misheard lyrics) - renders phonetic approximations over original text
  // Chinese soramimi: phonetic Chinese characters, English soramimi: phonetic English
  // This takes priority over all other pronunciation options when enabled
  if (romanization.soramimi) {
    const soramimiSegments = soramimiMap.get(line.startTimeMs);
    if (soramimiSegments && soramimiSegments.length > 0) {
      return renderSoramimiSegments(
        soramimiSegments,
        keyPrefix,
        pronunciationOnly,
        romanization.soramamiTargetLanguage
      );
    }
    // If soramimi is enabled but no data yet, show plain text (don't fall through to other methods)
    // This ensures soramimi is the exclusive annotation when enabled
    return processedText;
  }

  // If furigana is disabled, try other romanization types
  if (!romanization.japaneseFurigana) {
    const otherRomanization = renderOtherRomanization(
      processedText,
      keyPrefix,
      romanization,
      pronunciationOnly
    );
    return otherRomanization ?? processedText;
  }

  // Get furigana segments for this line
  const segments = furiganaMap.get(line.startTimeMs);
  if (!segments || segments.length === 0) {
    // No furigana available - try other romanization types
    const otherRomanization = renderOtherRomanization(
      processedText,
      keyPrefix,
      romanization,
      pronunciationOnly
    );
    return otherRomanization ?? processedText;
  }

  // Pronunciation-only mode: show only the phonetic readings
  if (pronunciationOnly) {
    const pronunciationOptions = {
      koreanRomanization: romanization.korean,
      japaneseRomaji: romanization.japaneseRomaji,
      chinesePinyin: romanization.chinese,
    };
    return (
      <span key={keyPrefix}>{getFuriganaSegmentsPronunciationOnly(segments, pronunciationOptions)}</span>
    );
  }

  // Render furigana segments with all romanization options (ruby annotations)
  return renderFuriganaSegments(segments, romanization);
}

/**
 * Creates a memoization-friendly render function for use in React components.
 *
 * @param options - Rendering options
 * @returns A function that renders a line with annotations
 */
export function createLyricsRenderer(options: RenderLyricsOptions) {
  return (line: LyricLine, processedText: string): React.ReactNode => {
    return renderLyricsWithAnnotations(line, processedText, options);
  };
}
