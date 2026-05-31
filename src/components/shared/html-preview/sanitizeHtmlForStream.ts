import DOMPurify from "dompurify";

export function sanitizeHtmlForStream(html: string): string {
  if (!html) return html;

  const baseSanitized =
    typeof window !== "undefined"
      ? DOMPurify.sanitize(html, {
          USE_PROFILES: { html: true },
          FORBID_TAGS: ["script", "iframe", "object", "embed", "link", "meta"],
        })
      : html;

  let sanitized = baseSanitized.replace(
    /<style\b[^>]*>([\s\S]*?)<\/style>/gi,
    (_match, styleContent) => {
      const filteredStyle = styleContent
        .replace(/(\s|^)(html|body|:root)\s*{[^}]*}/gi, "")
        .replace(/font-family\s*:\s*[^;}]+(;|$)/gi, "")
        .replace(/color\s*:\s*[^;}]+(;|$)/gi, "")
        .replace(/\s*@font-face\s*{[^}]*}/gi, "");

      return `<style>${filteredStyle}</style>`;
    }
  );

  sanitized = sanitized.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    ""
  );
  sanitized = sanitized.replace(/<link\b[^>]*>/gi, "");
  sanitized = sanitized.replace(/position\s*:\s*fixed/gi, "position: relative");
  sanitized = sanitized.replace(/position\s*:\s*sticky/gi, "position: relative");

  const processTailwindClasses = (classStr: string): string => {
    const classes = classStr.split(/\s+/);
    return classes
      .map((cls) => {
        if (cls === "fixed") return "relative";
        if (cls === "sticky") return "relative";
        if (/^(top|bottom|left|right|inset)(-|$)/.test(cls)) return "";
        return cls;
      })
      .filter(Boolean)
      .join(" ");
  };

  sanitized = sanitized.replace(/class="([^"]*)"/gi, (_match, classContent) => {
    return `class="${processTailwindClasses(classContent)}"`;
  });
  sanitized = sanitized.replace(
    /className="([^"]*)"/gi,
    (_match, classContent) => {
      return `className="${processTailwindClasses(classContent)}"`;
    }
  );
  sanitized = sanitized.replace(
    /(position\s*:\s*relative.*?)(top|left|right|bottom)\s*:\s*[^;]+/gi,
    "$1$2: auto"
  );
  sanitized = sanitized.replace(/z-index\s*:\s*\d+/gi, "z-index: auto");

  return sanitized;
}
