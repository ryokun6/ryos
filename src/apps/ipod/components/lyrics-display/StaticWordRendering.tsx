import type { LyricWord } from "@/types/lyrics";
import type { FuriganaSegment } from "@/utils/romanization";
import { toRomaji } from "wanakana";
import {
  isChineseText,
  hasKanaTextLocal,
  KOREAN_REGEX,
  renderKoreanWithRomanization,
  renderChineseWithPinyin,
  renderKanaWithRomaji,
  getKoreanPronunciationOnly,
  getChinesePronunciationOnly,
  getKanaPronunciationOnly,
} from "@/utils/romanization";
import { getDisplayReading } from "@/utils/furigana";
import { useMemo } from "react";
import type { ReactNode } from "react";
import {
  BASE_SHADOW,
  LYRICS_SHADOW_BLEED_BOTTOM,
  LYRICS_SHADOW_BLEED_TOP,
  LYRICS_SHADOW_BLEED_X,
  OLD_SCHOOL_BASE_COLOR,
  OLD_SCHOOL_BASE_STROKE,
  OLD_SCHOOL_PADDING,
  OLD_SCHOOL_PADDING_BOTTOM,
  OLD_SCHOOL_PADDING_TOP,
} from "./constants";
import {
  getTrailingWhitespace,
  mapWordTimingsToFurigana,
} from "./furiganaWordMapping";

export function StaticWordRendering({
  wordTimings,
  processText,
  furiganaSegments,
  koreanRomanized = false,
  japaneseRomaji = false,
  chinesePinyin = false,
  pronunciationOnly = false,
  soramimiTargetLanguage,
  lineStartTimeMs,
  onSeekToTime,
  isOldSchoolKaraoke = false,
  baseColor,
}: {
  wordTimings: LyricWord[];
  processText: (text: string) => string;
  furiganaSegments?: FuriganaSegment[];
  koreanRomanized?: boolean;
  japaneseRomaji?: boolean;
  chinesePinyin?: boolean;
  /** Show only pronunciation (replace original text with phonetic content) */
  pronunciationOnly?: boolean;
  /** Soramimi target language for spacing ("en" needs spaces between words) */
  soramimiTargetLanguage?: "zh-TW" | "en";
  lineStartTimeMs?: number;
  onSeekToTime?: (timeMs: number) => void;
  /** Use old-school karaoke styling (black outline, white text) */
  isOldSchoolKaraoke?: boolean;
  /** Base color for colored glow styles (gold/pink inactive state) */
  baseColor?: string;
}): ReactNode {
  // Pre-compute render items for consistency with animated version
  const renderItems = useMemo(() => {
    // Helper to get content for a word (handles romanization)
    const getWordContent = (text: string): ReactNode => {
      const processed = processText(text);
      // Check for kana first (romaji)
      if (japaneseRomaji && hasKanaTextLocal(processed)) {
        if (pronunciationOnly) {
          return getKanaPronunciationOnly(processed);
        }
        return renderKanaWithRomaji(processed, "word");
      }
      // Then check Korean
      if (koreanRomanized && KOREAN_REGEX.test(text)) {
        KOREAN_REGEX.lastIndex = 0; // Reset regex state
        if (pronunciationOnly) {
          return getKoreanPronunciationOnly(processed);
        }
        return renderKoreanWithRomanization(processed);
      }
      // Then check Chinese
      if (chinesePinyin && isChineseText(processed)) {
        if (pronunciationOnly) {
          return getChinesePronunciationOnly(processed);
        }
        return renderChineseWithPinyin(processed, "word");
      }
      return processed;
    };

    // Helper to check if text is primarily Latin characters (romanized output needs spaces)
    const isLatinText = (text: string): boolean => {
      // Check if text contains mostly Latin letters (a-z, A-Z)
      const latinChars = text.match(/[a-zA-Z]/g);
      return latinChars !== null && latinChars.length > text.length / 2;
    };

    // Helper to determine if a word's output will be romanized (Latin)
    const willOutputLatin = (text: string, reading?: string): boolean => {
      if (reading) {
        // If there's a reading, check if it will be romanized
        const displayReading = japaneseRomaji ? toRomaji(reading) : reading;
        return isLatinText(displayReading);
      }
      // No reading - check if getWordContent will romanize it
      const processed = processText(text);
      if (japaneseRomaji && hasKanaTextLocal(processed)) return true;
      if (koreanRomanized && KOREAN_REGEX.test(text)) {
        KOREAN_REGEX.lastIndex = 0;
        return true;
      }
      if (chinesePinyin && isChineseText(processed)) return true;
      return false;
    };

    // English soramimi always needs spaces
    const isEnglishSoramimi = soramimiTargetLanguage === "en";

    if (furiganaSegments && furiganaSegments.length > 0) {
      // Use character-position alignment to handle boundary mismatches
      // When a furigana segment spans multiple word timings, they're combined into one unit
      const { renderItems: mappedItems } = mapWordTimingsToFurigana(wordTimings, furiganaSegments);
      
      return mappedItems.map((item, idx) => {
        const word = wordTimings[item.wordIdx];
        // Get trailing space from last combined word
        const lastWordIdx = item.combinedWordIndices[item.combinedWordIndices.length - 1];
        const lastWord = wordTimings[lastWordIdx];
        const trailingSpace = getTrailingWhitespace(lastWord.text);
        const isLastWord = idx === mappedItems.length - 1;
        
        let content: ReactNode;
        const displayReadingSource = getDisplayReading(item);
        if (displayReadingSource) {
          // Has a reading - show combined text with ruby annotation
          // Convert to romaji if japaneseRomaji is enabled
          const displayReading = japaneseRomaji ? toRomaji(displayReadingSource) : displayReadingSource;
          // Only add space if output is Latin (romanized) or English soramimi
          const outputIsLatin = isLatinText(displayReading) || isEnglishSoramimi;
          const needsSpace = pronunciationOnly && outputIsLatin && !trailingSpace && !isLastWord;
          const spacer = needsSpace ? " " : trailingSpace;
          
          if (pronunciationOnly) {
            content = <>{displayReading}{spacer}</>;
          } else {
            content = (
              <>
                <ruby className="lyrics-furigana lyrics-soramimi">
                  {item.text}
                  <rt className="lyrics-furigana-rt lyrics-soramimi-rt">{displayReading}</rt>
                </ruby>
                {trailingSpace}
              </>
            );
          }
        } else {
          // No reading - check if this word will be romanized
          const wordContent = getWordContent(word.text);
          const outputIsLatin = willOutputLatin(word.text) || isEnglishSoramimi;
          const needsSpace = pronunciationOnly && outputIsLatin && !trailingSpace && !isLastWord;
          content = needsSpace ? <>{wordContent}{" "}</> : wordContent;
        }
        
        return {
          key: `${item.wordIdx}-${item.text}`,
          content,
          startTimeMs: word.startTimeMs,
        };
      });
    }
    
    return wordTimings.map((word, idx) => {
      const isLastWord = idx === wordTimings.length - 1;
      const trailingSpace = getTrailingWhitespace(word.text);
      const wordContent = getWordContent(word.text);
      // Only add space if output is Latin (romanized)
      const outputIsLatin = willOutputLatin(word.text) || isEnglishSoramimi;
      const needsSpace = pronunciationOnly && outputIsLatin && !trailingSpace && !isLastWord;
      const content = needsSpace ? <>{wordContent}{" "}</> : wordContent;
      return {
        key: `${idx}-${word.text}`,
        content,
        startTimeMs: word.startTimeMs,
      };
    });
  }, [wordTimings, furiganaSegments, processText, koreanRomanized, japaneseRomaji, chinesePinyin, pronunciationOnly, soramimiTargetLanguage]);

  const handleWordClick = (wordStartTimeMs: number) => {
    if (onSeekToTime && lineStartTimeMs !== undefined) {
      onSeekToTime(lineStartTimeMs + wordStartTimeMs);
    }
  };

  return (
    <>
      {renderItems.map((item) => (
          <span
            key={item.key}
            className={`lyrics-word-highlight ${onSeekToTime ? "cursor-pointer" : ""}`}
            onClick={onSeekToTime ? (e) => { 
              e.stopPropagation(); 
              handleWordClick(item.startTimeMs); 
            } : undefined}
          >
            <span 
              className={`lyrics-word-layer ${isOldSchoolKaraoke ? "" : baseColor ? "" : "opacity-55"}`} 
              style={{ 
                textShadow: isOldSchoolKaraoke ? "none" : BASE_SHADOW, 
                paddingTop: isOldSchoolKaraoke ? OLD_SCHOOL_PADDING_TOP : LYRICS_SHADOW_BLEED_TOP,
                marginTop: isOldSchoolKaraoke ? `-${OLD_SCHOOL_PADDING_TOP}` : `calc(-1 * ${LYRICS_SHADOW_BLEED_TOP})`,
                paddingBottom: isOldSchoolKaraoke ? OLD_SCHOOL_PADDING_BOTTOM : LYRICS_SHADOW_BLEED_BOTTOM,
                marginBottom: isOldSchoolKaraoke ? `-${OLD_SCHOOL_PADDING_BOTTOM}` : `calc(-1 * ${LYRICS_SHADOW_BLEED_BOTTOM})`,
                paddingLeft: isOldSchoolKaraoke ? OLD_SCHOOL_PADDING : LYRICS_SHADOW_BLEED_X,
                paddingRight: isOldSchoolKaraoke ? OLD_SCHOOL_PADDING : LYRICS_SHADOW_BLEED_X,
                marginLeft: isOldSchoolKaraoke ? `-${OLD_SCHOOL_PADDING}` : `calc(-1 * ${LYRICS_SHADOW_BLEED_X})`,
                marginRight: isOldSchoolKaraoke ? `-${OLD_SCHOOL_PADDING}` : `calc(-1 * ${LYRICS_SHADOW_BLEED_X})`,
                color: isOldSchoolKaraoke ? OLD_SCHOOL_BASE_COLOR : baseColor,
                WebkitTextStroke: isOldSchoolKaraoke ? OLD_SCHOOL_BASE_STROKE : undefined,
                paintOrder: isOldSchoolKaraoke ? "stroke fill" : undefined,
              } as React.CSSProperties}
            >
              {item.content}
            </span>
          </span>
      ))}
    </>
  );
}
