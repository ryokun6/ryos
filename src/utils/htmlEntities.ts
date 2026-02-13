const NAMED_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

const HTML_ENTITY_PATTERN = /&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g;

const decodeEntity = (entityBody: string): string => {
  if (entityBody in NAMED_ENTITY_MAP) {
    return NAMED_ENTITY_MAP[entityBody];
  }

  if (entityBody.startsWith("#")) {
    const isHex = entityBody[1]?.toLowerCase() === "x";
    const rawValue = isHex ? entityBody.slice(2) : entityBody.slice(1);
    const radix = isHex ? 16 : 10;
    const codePoint = Number.parseInt(rawValue, radix);

    if (
      Number.isInteger(codePoint) &&
      codePoint >= 0 &&
      codePoint <= 0x10ffff
    ) {
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return `&${entityBody};`;
      }
    }
  }

  return `&${entityBody};`;
};

/**
 * Single-pass HTML entity decoding.
 * This intentionally avoids recursive decoding so "&amp;lt;" becomes "&lt;".
 */
export const decodeHtmlEntities = (value: string): string => {
  if (!value || !value.includes("&")) return value;
  return value.replace(HTML_ENTITY_PATTERN, (_, entityBody: string) =>
    decodeEntity(entityBody)
  );
};
