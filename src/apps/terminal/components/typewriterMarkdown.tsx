import React from "react";

export const parseSimpleMarkdown = (text: string): React.ReactNode[] => {
  if (!text) return [text];

  // Process the bold formatting first, then italic
  let result: React.ReactNode[] = [];
  const currentText = text;

  // Process bold patterns first (**text** or __text__)
  const boldRegex = /(\*\*.*?\*\*|__.*?__)/g;
  let lastIndex = 0;
  let boldMatch;

  while ((boldMatch = boldRegex.exec(currentText)) !== null) {
    // Add text before the match
    if (boldMatch.index > lastIndex) {
      result.push(currentText.substring(lastIndex, boldMatch.index));
    }

    // Add the bold text
    const boldContent = boldMatch[0].replace(/^\*\*|\*\*$|^__|__$/g, "");
    result.push(
      <span key={`bold-${boldMatch.index}`} className="font-bold">
        {boldContent}
      </span>
    );

    lastIndex = boldMatch.index + boldMatch[0].length;
  }

  // Add any remaining text after the last bold match
  if (lastIndex < currentText.length) {
    result.push(currentText.substring(lastIndex));
  }

  // Now process italic in each text segment
  result = result.flatMap((segment, i) => {
    if (typeof segment !== "string") return segment;

    const italicParts: React.ReactNode[] = [];
    const italicRegex = /(\*[^*]+\*|_[^_]+_)/g;
    let lastItalicIndex = 0;
    let italicMatch;

    while ((italicMatch = italicRegex.exec(segment)) !== null) {
      // Add text before the match
      if (italicMatch.index > lastItalicIndex) {
        italicParts.push(segment.substring(lastItalicIndex, italicMatch.index));
      }

      // Add the italic text
      const italicContent = italicMatch[0].replace(/^\*|\*$|^_|_$/g, "");
      italicParts.push(
        <span key={`italic-${i}-${italicMatch.index}`} className="italic">
          {italicContent}
        </span>
      );

      lastItalicIndex = italicMatch.index + italicMatch[0].length;
    }

    // Add any remaining text after the last italic match
    if (lastItalicIndex < segment.length) {
      italicParts.push(segment.substring(lastItalicIndex));
    }

    return italicParts.length > 0 ? italicParts : segment;
  });

  return result;
};
