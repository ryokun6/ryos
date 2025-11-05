const RESET_MARKER = "data-ryos-applet-viewer-reset";
const MAC_FONT_MARKER = "data-ryos-applet-font-fix";

const RESET_STYLE = `<style data-ryos-applet-viewer-reset="true">
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
  }

  body {
    background-color: transparent;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }
</style>`;

const MAC_FONT_INJECTION = `<link rel="stylesheet" href="/fonts/fonts.css">
<style data-ryos-applet-font-fix>
  html, body {
    font-family: "LucidaGrande", "Lucida Grande", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Noto Color Emoji", sans-serif !important;
  }

  * {
    font-family: inherit !important;
  }

  h1, h2, h3, h4, h5, h6,
  p, div, span, a,
  li, ul, ol,
  button, input, select, textarea, label,
  code, pre, blockquote,
  small, strong, em,
  table, th, td {
    font-family: "LucidaGrande", "Lucida Grande", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Noto Color Emoji", sans-serif !important;
  }
</style>`;

const DOCTYPE_REGEX = /^<!doctype\s+html[^>]*>/i;

const stripOuterHtmlWrapper = (fragment: string): string =>
  fragment
    .replace(/^\s*<\/?html[^>]*>/i, "")
    .replace(/<\/html>\s*$/i, "");

const extractDoctype = (content: string) => {
  const match = content.match(DOCTYPE_REGEX);
  if (!match) {
    return {
      doctype: "<!DOCTYPE html>",
      rest: content,
    };
  }

  const rest = content.slice(match[0].length);
  return {
    doctype: match[0],
    rest,
  };
};

const injectIntoHead = (content: string, injection: string): string => {
  if (!content) {
    return content;
  }

  const lowerContent = content.toLowerCase();
  const headCloseIdx = lowerContent.lastIndexOf("</head>");

  if (headCloseIdx !== -1) {
    return (
      content.slice(0, headCloseIdx) +
      `\n${injection}\n` +
      content.slice(headCloseIdx)
    );
  }

  const headOpenMatch = /<head[^>]*>/i.exec(content);
  if (headOpenMatch) {
    const idx = headOpenMatch.index + headOpenMatch[0].length;
    return (
      content.slice(0, idx) +
      `\n${injection}\n` +
      content.slice(idx)
    );
  }

  const htmlOpenMatch = /<html[^>]*>/i.exec(content);
  if (htmlOpenMatch) {
    const idx = htmlOpenMatch.index + htmlOpenMatch[0].length;
    return (
      content.slice(0, idx) +
      `<head>\n${injection}\n</head>` +
      content.slice(idx)
    );
  }

  const { doctype, rest } = extractDoctype(content);
  const sanitized = stripOuterHtmlWrapper(rest).trimStart();

  if (/<body[^>]*>/i.test(rest)) {
    return `${doctype}\n<html><head>\n${injection}\n</head>${sanitized}</html>`;
  }

  return `${doctype}\n<html><head>\n${injection}\n</head><body>${sanitized}</body></html>`;
};

interface PrepareAppletContentOptions {
  applyMacFontFix?: boolean;
}

export const prepareAppletContent = (
  content: string,
  options: PrepareAppletContentOptions = {}
): string => {
  if (!content) {
    return content;
  }

  let result = content;

  if (!result.includes(RESET_MARKER)) {
    result = injectIntoHead(result, RESET_STYLE);
  }

  if (options.applyMacFontFix && !result.includes(MAC_FONT_MARKER)) {
    result = injectIntoHead(result, MAC_FONT_INJECTION);
  }

  return result;
};
