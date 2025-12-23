import { LyricLine } from "@/types/lyrics";

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

export const parseLRC = (
  lrcText: string,
  title: string,
  artist: string
): LyricLine[] => {
  const skipList = [
    ...SKIP_PREFIXES,
    `${title} - ${artist}`,
    `${artist} - ${title}`,
  ];

  // Normalize line endings: convert \r\n to \n and standalone \r to \n
  const normalizedText = lrcText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const result = normalizedText
    .split("\n")
    .map((line) => {
      const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.+)/);
      if (!match) return null;

      const [, min, sec, ms, text] = match;
      const trimmedText = text.trim();

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

      const timeMs = (
        parseInt(min) * 60000 +
        parseInt(sec) * 1000 +
        parseInt(ms.padEnd(3, "0"))
      ).toString();

      return {
        startTimeMs: timeMs,
        words: trimmedText,
      };
    })
    .filter((line): line is LyricLine => line !== null);

  if (result.length === 0) {
    console.warn("[parseLRC] No lyrics parsed from LRC text. First 500 chars:", lrcText.slice(0, 500));
  } else {
    console.log("[parseLRC] Parsed", result.length, "lyric lines");
  }

  return result;
};
