import { LyricLine, LyricWord } from "@/types/lyrics";

/**
 * Prefixes to skip when parsing lyrics (credits, production info, etc.)
 */
const SKIP_PREFIXES = [
  "作词",
  "作曲",
  "编曲",
  "制作",
  "发行",
  "出品",
  "监制",
  "策划",
  "统筹",
  "录音",
  "混音",
  "母带",
  "和声",
  "版权",
  "吉他",
  "贝斯",
  "鼓",
  "键盘",
  "企划",
  "词",
  "詞：",
  "曲",
  "男：",
  "女：",
  "合：",
  "OP",
  "SP",
  "Produced",
  "Composed",
  "Arranged",
  "Mixed",
  "Lyrics",
  "Keyboard",
  "Guitar",
  "Bass",
  "Drum",
  "Vocal",
  "Original Publisher",
  "Sub-publisher",
  "Electric Piano",
  "Synth by",
  "Recorded by",
  "Mixed by",
  "Mastered by",
  "Produced by",
  "Composed by",
  "Digital Editing by",
  "Mix Assisted by",
  "Mix by",
  "Mix Engineer",
  "Background vocals",
  "Background vocals by",
  "Chorus by",
  "Percussion by",
  "String by",
  "Harp by",
  "Piano by",
  "Piano Arranged by",
  "Written by",
  "Additional Production by",
  "Synthesizer",
  "Programming",
  "Background Vocals",
  "Recording Engineer",
  "Digital Editing",
] as const;

/**
 * Parse KRC format lyrics with word-level timing
 * 
 * KRC line format: [lineStartMs,lineDurationMs]<wordOffsetMs,wordDurationMs,0>text<...>text
 * Example: [5000,2000]<0,500,0>Hel<500,300,0>lo <800,700,0>world
 * 
 * @param krcText - The decoded KRC text content
 * @param title - Song title (used for skip list)
 * @param artist - Song artist (used for skip list)
 * @returns Array of LyricLine objects with word-level timing
 */
export function parseKRC(
  krcText: string,
  title: string,
  artist: string
): LyricLine[] {
  const skipList = [
    ...SKIP_PREFIXES,
    `${title} - ${artist}`,
    `${artist} - ${title}`,
  ];

  // Regex to match line header: [startMs,durationMs]
  const lineHeaderRegex = /^\[(\d+),(\d+)\](.*)$/;
  
  // Regex to match word timing: <offsetMs,durationMs,flag>text
  // The flag (third number) is typically 0 and can be ignored
  const wordTimingRegex = /<(\d+),(\d+),\d+>([^<]*)/g;

  // Normalize line endings: convert \r\n to \n and standalone \r to \n
  const normalizedText = krcText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const result = normalizedText
    .split("\n")
    .map((line) => {
      const lineMatch = line.match(lineHeaderRegex);
      if (!lineMatch) return null;

      const [, startMs, , content] = lineMatch;
      
      // Extract word timings
      const wordTimings: LyricWord[] = [];
      let fullText = "";
      let match;

      // Reset regex lastIndex for each line
      wordTimingRegex.lastIndex = 0;

      while ((match = wordTimingRegex.exec(content)) !== null) {
        const [, offsetMs, durationMs, text] = match;
        
        // Skip empty text segments
        if (text) {
          wordTimings.push({
            text,
            startTimeMs: parseInt(offsetMs, 10),
            durationMs: parseInt(durationMs, 10),
          });
          fullText += text;
        }
      }

      // If no word timings found, try to extract plain text
      // (some lines might not have word-level timing)
      if (wordTimings.length === 0) {
        // Remove any remaining timing markers and get plain text
        const plainText = content.replace(/<\d+,\d+,\d+>/g, "").trim();
        if (plainText) {
          fullText = plainText;
        }
      }

      const trimmedText = fullText.trim();

      // Skip lines that match skip prefixes
      if (skipList.some((prefix) => trimmedText.startsWith(prefix))) {
        return null;
      }

      // Skip lines entirely wrapped in parentheses (e.g., "(instrumental)")
      // Handle both regular () and full-width （）parentheses
      if (
        (trimmedText.startsWith("(") && trimmedText.endsWith(")")) ||
        (trimmedText.startsWith("（") && trimmedText.endsWith("）"))
      ) {
        return null;
      }

      // Skip empty lines
      if (!trimmedText) {
        return null;
      }

      const lyricLine: LyricLine = {
        startTimeMs: startMs,
        words: trimmedText,
      };
      if (wordTimings.length > 0) {
        lyricLine.wordTimings = wordTimings;
      }
      return lyricLine;
    })
    .filter((line): line is LyricLine => line !== null);

  if (result.length === 0) {
    console.warn("[parseKRC] No lyrics parsed from KRC text. First 500 chars:", krcText.slice(0, 500));
  } else {
    console.log("[parseKRC] Parsed", result.length, "lyric lines");
  }

  return result;
}

/**
 * Check if text appears to be KRC format
 * KRC has word-level timing markers: <offset,duration,flag>
 * This is the most reliable indicator since LRC doesn't have this pattern
 */
export function isKRCFormat(text: string): boolean {
  // KRC word timing pattern: <number,number,number>text
  // This pattern is unique to KRC and doesn't appear in LRC
  const krcWordTimingPattern = /<\d+,\d+,\d+>/;
  
  // Also check for the KRC line format: [startMs,durationMs]
  const krcLinePattern = /^\[\d+,\d+\]/m;
  
  // Check for word timing markers (most reliable)
  if (krcWordTimingPattern.test(text)) {
    return true;
  }
  
  // Fallback: check for KRC line format pattern anywhere in the text
  return krcLinePattern.test(text);
}
